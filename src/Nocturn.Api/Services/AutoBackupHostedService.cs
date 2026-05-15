using Microsoft.EntityFrameworkCore;
using Nocturn.Core.Interfaces;
using Nocturn.Core.Models;
using Nocturn.Core.Services;
using Nocturn.Data;

namespace Nocturn.Api.Services;

public class AutoBackupHostedService(
    IServiceScopeFactory scopeFactory,
    AppSettings settings) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
            await TryRunBackupAsync(stoppingToken);
    }

    private async Task TryRunBackupAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var backup = scope.ServiceProvider.GetRequiredService<BackupService>();
        var db = scope.ServiceProvider.GetRequiredService<NocturnDbContext>();

        if (!backup.ShouldRunAutoBackup()) return;

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
    }
}
