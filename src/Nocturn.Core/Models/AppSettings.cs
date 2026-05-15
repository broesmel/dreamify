namespace Nocturn.Core.Models;

public class AppSettings
{
    public string OllamaEndpoint { get; set; } = "http://localhost:11434/v1";
    public string ModelName { get; set; } = "llama3.2:3b";
    public string InferenceMode { get; set; } = "ollama";  // "ollama" | "local"
    public string LocalModelPath { get; set; } = "";
    public BackupSettings Backup { get; set; } = new();

    public static string SettingsFilePath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Nocturn", "settings.json");
}

public class BackupSettings
{
    public string AutoBackupFrequency { get; set; } = "off";  // off | on-exit | daily | weekly
    public string BackupFolderPath { get; set; } = DefaultBackupPath();
    public int MaxBackupsToKeep { get; set; } = 10;
    public bool IncludeRawTranscripts { get; set; } = false;
    public bool IncludeSettings { get; set; } = true;
    public bool EncryptBackups { get; set; } = false;
    public string? BackupPassphrase { get; set; }
    public DateTime? LastAutoBackupUtc { get; set; }

    private static string DefaultBackupPath() =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "Nocturn", "Backups");
}
