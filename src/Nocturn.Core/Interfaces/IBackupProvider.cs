namespace Nocturn.Core.Interfaces;

public interface IBackupProvider
{
    Task<string> ExportAsync(BackupExportOptions options, CancellationToken ct = default);
    Task<BackupImportResult> ImportAsync(Stream backupStream, string? passphrase, bool overwrite, CancellationToken ct = default);
}

public record BackupExportOptions(
    bool IncludeTranscripts = false,
    bool IncludeSettings = true,
    string? Passphrase = null);

public record BackupImportResult(
    bool Success,
    int EntriesImported,
    int SessionsImported,
    int Conflicts,
    int FormatVersion,
    string? Error = null);
