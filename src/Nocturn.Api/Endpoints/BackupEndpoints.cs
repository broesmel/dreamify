using Microsoft.EntityFrameworkCore;
using Nocturn.Api.Services;
using Nocturn.Core.Interfaces;
using Nocturn.Core.Models;
using Nocturn.Core.Services;
using Nocturn.Data;

namespace Nocturn.Api.Endpoints;

public static class BackupEndpoints
{
    public static void MapBackupEndpoints(this WebApplication app)
    {
        app.MapPost("/backup/export", async (
            BackupExportRequest req,
            BackupService backup,
            NocturnDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var entries = await db.JournalEntries.ToListAsync(ct);
            var sessions = await db.Sessions.ToListAsync(ct);

            var options = new BackupExportOptions(
                req.IncludeTranscripts,
                req.IncludeSettings,
                string.IsNullOrEmpty(req.Passphrase) ? null : req.Passphrase);

            var bytes = await backup.ExportAsync(entries, sessions, options, ct);
            var filename = $"nocturn-backup-{DateTime.UtcNow:yyyyMMddTHHmmssZ}.nocturn-backup";

            return Results.File(bytes, "application/octet-stream", filename);
        });

        app.MapPost("/backup/import", async (
            IFormFile file,
            string? passphrase,
            bool overwrite,
            BackupService backup,
            NocturnDbContext db,
            CancellationToken ct) =>
        {
            using var stream = file.OpenReadStream();
            var result = await backup.ImportAsync(
                stream,
                async entries =>
                {
                    int imported = 0, conflicts = 0;
                    foreach (var entry in entries)
                    {
                        var exists = await db.JournalEntries.AnyAsync(e => e.Id == entry.Id, ct);
                        if (exists && !overwrite) { conflicts++; continue; }
                        if (exists) db.JournalEntries.Update(entry);
                        else db.JournalEntries.Add(entry);
                        imported++;
                    }
                    await db.SaveChangesAsync(ct);
                    return (imported, conflicts);
                },
                async sessions =>
                {
                    int imported = 0, conflicts = 0;
                    foreach (var session in sessions)
                    {
                        var exists = await db.Sessions.AnyAsync(s => s.Id == session.Id, ct);
                        if (exists && !overwrite) { conflicts++; continue; }
                        if (exists) db.Sessions.Update(session);
                        else db.Sessions.Add(session);
                        imported++;
                    }
                    await db.SaveChangesAsync(ct);
                    return (imported, conflicts);
                },
                passphrase, overwrite, ct);

            return result.Success ? Results.Ok(result) : Results.BadRequest(result);
        }).DisableAntiforgery();

        app.MapGet("/backup/list", (AppSettings settings) =>
        {
            var dir = settings.Backup.BackupFolderPath;
            if (!Directory.Exists(dir))
                return Results.Ok(Array.Empty<object>());

            var files = Directory.GetFiles(dir, "*.nocturn-backup")
                .Select(path =>
                {
                    var info = new FileInfo(path);
                    var manifest = BackupService.ReadManifestFromFile(path);
                    return new
                    {
                        filename = info.Name,
                        createdAtUtc = info.CreationTimeUtc,
                        sizeBytes = info.Length,
                        encrypted = manifest?.Encrypted ?? false,
                        entryCount = manifest?.EntryCount ?? 0,
                        formatVersion = manifest?.FormatVersion ?? 0
                    };
                })
                .OrderByDescending(f => f.createdAtUtc)
                .ToList();

            return Results.Ok(files);
        });

        app.MapDelete("/backup/{filename}", (string filename, AppSettings settings) =>
        {
            var path = Path.Combine(settings.Backup.BackupFolderPath,
                Path.GetFileName(filename));  // sanitize — no path traversal

            if (!File.Exists(path)) return Results.NotFound();
            File.Delete(path);
            return Results.NoContent();
        });

        app.MapGet("/backup/settings", (AppSettings settings) =>
            Results.Ok(settings.Backup));

        app.MapPut("/backup/settings", async (
            BackupSettings updated,
            AppSettings settings,
            CancellationToken ct) =>
        {
            if (!string.IsNullOrEmpty(updated.BackupFolderPath))
            {
                try { Directory.CreateDirectory(updated.BackupFolderPath); }
                catch { return Results.BadRequest("Backup folder path is not writable."); }
            }

            settings.Backup.AutoBackupFrequency = updated.AutoBackupFrequency;
            settings.Backup.BackupFolderPath = updated.BackupFolderPath;
            settings.Backup.MaxBackupsToKeep = updated.MaxBackupsToKeep;
            settings.Backup.IncludeRawTranscripts = updated.IncludeRawTranscripts;
            settings.Backup.IncludeSettings = updated.IncludeSettings;
            settings.Backup.EncryptBackups = updated.EncryptBackups;
            if (updated.BackupPassphrase is not null)
                settings.Backup.BackupPassphrase = updated.BackupPassphrase;

            await AppSettingsStore.SaveAsync(settings, ct);
            return Results.Ok(settings.Backup);
        });

        app.MapPost("/backup/trigger", async (
            BackupService backup,
            NocturnDbContext db,
            AppSettings settings,
            CancellationToken ct) =>
        {
            if (!backup.ShouldRunAutoBackup())
                return Results.Ok(new { skipped = true, reason = "Not due yet." });

            var entries = await db.JournalEntries.ToListAsync(ct);
            var sessions = await db.Sessions.ToListAsync(ct);

            var passphrase = settings.Backup.EncryptBackups ? settings.Backup.BackupPassphrase : null;
            var options = new BackupExportOptions(
                settings.Backup.IncludeRawTranscripts,
                settings.Backup.IncludeSettings,
                passphrase);

            var bytes = await backup.ExportAsync(entries, sessions, options, ct);
            var dir = settings.Backup.BackupFolderPath;
            Directory.CreateDirectory(dir);

            var filename = $"nocturn-backup-{DateTime.UtcNow:yyyyMMddTHHmmssZ}.nocturn-backup";
            await File.WriteAllBytesAsync(Path.Combine(dir, filename), bytes, ct);

            settings.Backup.LastAutoBackupUtc = DateTime.UtcNow;
            await AppSettingsStore.SaveAsync(settings, ct);
            backup.PruneOldBackups();

            return Results.Ok(new { filename, entryCount = entries.Count });
        });

        app.MapGet("/health/model", async (IConfiguration config, CancellationToken ct) =>
        {
            var endpoint = (config["Ollama:Endpoint"] ?? "http://localhost:11434/v1")
                .Replace("/v1", "");
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                var resp = await http.GetAsync($"{endpoint}/api/tags", ct);
                if (!resp.IsSuccessStatusCode) return Results.Problem("Ollama not responding");

                var body = await resp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(ct);
                var models = body.GetProperty("models")
                    .EnumerateArray()
                    .Select(m => m.GetProperty("name").GetString())
                    .ToList();

                return Results.Ok(new { status = "ok", availableModels = models });
            }
            catch
            {
                return Results.Problem("Ollama not running. Start it with: ollama serve");
            }
        });
    }
}

public record BackupExportRequest(
    bool IncludeTranscripts = false,
    bool IncludeSettings = true,
    string? Passphrase = null);
