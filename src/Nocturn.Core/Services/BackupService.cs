using Nocturn.Core.Interfaces;
using Nocturn.Core.Models;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Nocturn.Core.Services;

public class BackupService(AppSettings settings)
{
    private const int FormatVersion = 1;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public async Task<byte[]> ExportAsync(
        IReadOnlyList<JournalEntry> entries,
        IReadOnlyList<Session> sessions,
        BackupExportOptions options,
        CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            var manifest = new BackupManifest
            {
                FormatVersion = FormatVersion,
                AppVersion = "1.0.0",
                CreatedAtUtc = DateTime.UtcNow,
                Platform = Environment.OSVersion.Platform.ToString(),
                EntryCount = entries.Count,
                SessionCount = sessions.Count,
                IncludesSettings = options.IncludeSettings,
                Encrypted = options.Passphrase is not null
            };

            await WriteZipEntryAsync(zip, "manifest.json", manifest, ct);

            if (options.Passphrase is not null)
            {
                var salt = RandomNumberGenerator.GetBytes(32);
                var payload = await BuildPayloadAsync(entries, sessions, options, ct);
                var encrypted = Encrypt(payload, options.Passphrase, salt);

                await WriteZipEntryBytesAsync(zip, "salt.bin", salt);
                await WriteZipEntryBytesAsync(zip, "payload.enc", encrypted);
            }
            else
            {
                var exportEntries = options.IncludeTranscripts
                    ? entries
                    : entries.Select(e => new JournalEntry
                    {
                        Id = e.Id, SessionId = e.SessionId, Type = e.Type,
                        Summary = e.Summary, Tags = e.Tags, CapturedAt = e.CapturedAt
                    }).ToList<JournalEntry>();

                await WriteZipEntryAsync(zip, "entries.json", exportEntries, ct);
                await WriteZipEntryAsync(zip, "sessions.json", sessions, ct);

                if (options.IncludeSettings)
                    await WriteZipEntryAsync(zip, "settings.json", settings, ct);
            }
        }

        return ms.ToArray();
    }

    public async Task<BackupImportResult> ImportAsync(
        Stream backupStream,
        Func<IReadOnlyList<JournalEntry>, Task<(int imported, int conflicts)>> saveEntries,
        Func<IReadOnlyList<Session>, Task<(int imported, int conflicts)>> saveSessions,
        string? passphrase = null,
        bool overwrite = false,
        CancellationToken ct = default)
    {
        try
        {
            using var zip = new ZipArchive(backupStream, ZipArchiveMode.Read);

            var manifest = await ReadZipEntryAsync<BackupManifest>(zip, "manifest.json", ct)
                ?? throw new InvalidDataException("Missing manifest.json");

            List<JournalEntry> entries;
            List<Session> sessions;

            if (manifest.Encrypted)
            {
                if (passphrase is null)
                    return new BackupImportResult(false, 0, 0, 0, manifest.FormatVersion,
                        "Backup is encrypted — passphrase required.");

                var salt = await ReadZipEntryBytesAsync(zip, "salt.bin")
                    ?? throw new InvalidDataException("Missing salt.bin");
                var ciphertext = await ReadZipEntryBytesAsync(zip, "payload.enc")
                    ?? throw new InvalidDataException("Missing payload.enc");

                var plaintext = Decrypt(ciphertext, passphrase, salt);
                using var payloadZip = new ZipArchive(new MemoryStream(plaintext), ZipArchiveMode.Read);
                entries = await ReadZipEntryAsync<List<JournalEntry>>(payloadZip, "entries.json", ct) ?? [];
                sessions = await ReadZipEntryAsync<List<Session>>(payloadZip, "sessions.json", ct) ?? [];
            }
            else
            {
                entries = await ReadZipEntryAsync<List<JournalEntry>>(zip, "entries.json", ct) ?? [];
                sessions = await ReadZipEntryAsync<List<Session>>(zip, "sessions.json", ct) ?? [];
            }

            var (entriesImported, entryConflicts) = await saveEntries(entries);
            var (sessionsImported, sessionConflicts) = await saveSessions(sessions);

            return new BackupImportResult(
                true, entriesImported, sessionsImported,
                entryConflicts + sessionConflicts, manifest.FormatVersion);
        }
        catch (Exception ex)
        {
            return new BackupImportResult(false, 0, 0, 0, 0, ex.Message);
        }
    }

    public bool ShouldRunAutoBackup()
    {
        var freq = settings.Backup.AutoBackupFrequency;
        if (freq == "off") return false;

        var last = settings.Backup.LastAutoBackupUtc;
        if (last is null) return true;

        return freq switch
        {
            "on-exit" => true,
            "daily" => DateTime.UtcNow - last.Value > TimeSpan.FromDays(1),
            "weekly" => DateTime.UtcNow - last.Value > TimeSpan.FromDays(7),
            _ => false
        };
    }

    public void PruneOldBackups()
    {
        var dir = settings.Backup.BackupFolderPath;
        if (!Directory.Exists(dir)) return;

        var files = Directory.GetFiles(dir, "*.nocturn-backup")
            .Select(f => new FileInfo(f))
            .OrderByDescending(f => f.CreationTimeUtc)
            .Skip(settings.Backup.MaxBackupsToKeep)
            .ToList();

        foreach (var file in files)
            file.Delete();
    }

    public static BackupManifest? ReadManifestFromFile(string path)
    {
        try
        {
            using var fs = File.OpenRead(path);
            using var zip = new ZipArchive(fs, ZipArchiveMode.Read);
            var entry = zip.GetEntry("manifest.json");
            if (entry is null) return null;
            using var stream = entry.Open();
            return JsonSerializer.Deserialize<BackupManifest>(stream);
        }
        catch
        {
            return null;
        }
    }

    private static async Task<byte[]> BuildPayloadAsync(
        IReadOnlyList<JournalEntry> entries,
        IReadOnlyList<Session> sessions,
        BackupExportOptions options,
        CancellationToken ct)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            var exportEntries = options.IncludeTranscripts
                ? entries
                : entries.Select(e => new JournalEntry
                {
                    Id = e.Id, SessionId = e.SessionId, Type = e.Type,
                    Summary = e.Summary, Tags = e.Tags, CapturedAt = e.CapturedAt
                }).ToList<JournalEntry>();

            await WriteZipEntryAsync(zip, "entries.json", exportEntries, ct);
            await WriteZipEntryAsync(zip, "sessions.json", sessions, ct);
        }
        return ms.ToArray();
    }

    private static byte[] Encrypt(byte[] plaintext, string passphrase, byte[] salt)
    {
        var key = DeriveKey(passphrase, salt);
        var nonce = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[AesGcm.TagByteSizes.MaxSize];

        using var aes = new AesGcm(key, AesGcm.TagByteSizes.MaxSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        // Layout: [nonce (12)] [tag (16)] [ciphertext]
        var result = new byte[nonce.Length + tag.Length + ciphertext.Length];
        Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, result, nonce.Length, tag.Length);
        Buffer.BlockCopy(ciphertext, 0, result, nonce.Length + tag.Length, ciphertext.Length);
        return result;
    }

    private static byte[] Decrypt(byte[] data, string passphrase, byte[] salt)
    {
        var key = DeriveKey(passphrase, salt);
        const int nonceSize = 12, tagSize = 16;
        var nonce = data[..nonceSize];
        var tag = data[nonceSize..(nonceSize + tagSize)];
        var ciphertext = data[(nonceSize + tagSize)..];
        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(key, tagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return plaintext;
    }

    private static byte[] DeriveKey(string passphrase, byte[] salt) =>
        new Rfc2898DeriveBytes(
            Encoding.UTF8.GetBytes(passphrase), salt,
            600_000, HashAlgorithmName.SHA256).GetBytes(32);

    private static async Task WriteZipEntryAsync<T>(
        ZipArchive zip, string name, T value, CancellationToken ct)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        await using var stream = entry.Open();
        await JsonSerializer.SerializeAsync(stream, value, JsonOpts, ct);
    }

    private static async Task WriteZipEntryBytesAsync(ZipArchive zip, string name, byte[] data)
    {
        var entry = zip.CreateEntry(name);
        await using var stream = entry.Open();
        await stream.WriteAsync(data);
    }

    private static async Task<T?> ReadZipEntryAsync<T>(
        ZipArchive zip, string name, CancellationToken ct)
    {
        var entry = zip.GetEntry(name);
        if (entry is null) return default;
        using var stream = entry.Open();
        return await JsonSerializer.DeserializeAsync<T>(stream, cancellationToken: ct);
    }

    private static async Task<byte[]?> ReadZipEntryBytesAsync(ZipArchive zip, string name)
    {
        var entry = zip.GetEntry(name);
        if (entry is null) return null;
        using var stream = entry.Open();
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms);
        return ms.ToArray();
    }
}

public record BackupManifest
{
    public int FormatVersion { get; init; }
    public string AppVersion { get; init; } = "";
    public DateTime CreatedAtUtc { get; init; }
    public string Platform { get; init; } = "";
    public int EntryCount { get; init; }
    public int SessionCount { get; init; }
    public bool IncludesSettings { get; init; }
    public bool Encrypted { get; init; }
}
