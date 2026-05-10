using Nocturn.Core.Interfaces;
using Nocturn.Core.Models;
using Nocturn.Core.Services;
using System.IO.Compression;
using System.Text.Json;

namespace Nocturn.Core.Tests;

public class BackupServiceTests
{
    private static BackupService CreateService(BackupSettings? backup = null)
    {
        var settings = new AppSettings { Backup = backup ?? new BackupSettings() };
        return new BackupService(settings);
    }

    private static List<JournalEntry> SampleEntries() =>
    [
        new() { Id = Guid.NewGuid(), Type = "evening", Summary = "A quiet day", Tags = ["calm", "focused"] },
        new() { Id = Guid.NewGuid(), Type = "dream", Summary = "A strange forest", Tags = ["forest", "mystery"] }
    ];

    private static List<Session> SampleSessions() =>
    [
        new() { Id = Guid.NewGuid(), Mode = "evening" }
    ];

    [Fact]
    public async Task Export_CreatesValidZip()
    {
        var svc = CreateService();
        var entries = SampleEntries();
        var sessions = SampleSessions();

        var bytes = await svc.ExportAsync(entries, sessions, new BackupExportOptions());

        Assert.NotEmpty(bytes);
        using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        Assert.NotNull(zip.GetEntry("manifest.json"));
        Assert.NotNull(zip.GetEntry("entries.json"));
        Assert.NotNull(zip.GetEntry("sessions.json"));
    }

    [Fact]
    public async Task Export_ManifestHasCorrectCounts()
    {
        var svc = CreateService();
        var entries = SampleEntries();
        var sessions = SampleSessions();

        var bytes = await svc.ExportAsync(entries, sessions, new BackupExportOptions());

        using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        using var stream = zip.GetEntry("manifest.json")!.Open();
        var manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(stream);

        Assert.Equal(2, manifest!.EntryCount);
        Assert.Equal(1, manifest.SessionCount);
        Assert.Equal(1, manifest.FormatVersion);
        Assert.False(manifest.Encrypted);
    }

    [Fact]
    public async Task Export_ExcludesTranscriptsWhenNotRequested()
    {
        var svc = CreateService();
        var entries = SampleEntries();
        entries[0].RawTranscript = "secret conversation text";

        var bytes = await svc.ExportAsync(entries, entries.Select(_ => new Session()).ToList(),
            new BackupExportOptions(IncludeTranscripts: false));

        using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        using var stream = zip.GetEntry("entries.json")!.Open();
        var exported = await JsonSerializer.DeserializeAsync<List<JournalEntry>>(stream);

        Assert.All(exported!, e => Assert.Null(e.RawTranscript));
    }

    [Fact]
    public async Task Import_RestoresAllEntries()
    {
        var svc = CreateService();
        var entries = SampleEntries();
        var sessions = SampleSessions();

        var bytes = await svc.ExportAsync(entries, sessions, new BackupExportOptions());

        var importedEntries = new List<JournalEntry>();
        var importedSessions = new List<Session>();

        var result = await svc.ImportAsync(
            new MemoryStream(bytes),
            async list => { importedEntries.AddRange(list); return (list.Count, 0); },
            async list => { importedSessions.AddRange(list); return (list.Count, 0); });

        Assert.True(result.Success);
        Assert.Equal(2, result.EntriesImported);
        Assert.Equal(1, result.SessionsImported);
        Assert.Equal(0, result.Conflicts);
        Assert.Equal(entries[0].Summary, importedEntries[0].Summary);
        Assert.Equal(entries[1].Tags, importedEntries[1].Tags);
    }

    [Fact]
    public async Task ExportImport_RoundTrip_PreservesData()
    {
        var svc = CreateService();
        var original = SampleEntries();

        var bytes = await svc.ExportAsync(original, SampleSessions(), new BackupExportOptions());

        JournalEntry? restored = null;
        await svc.ImportAsync(
            new MemoryStream(bytes),
            async list => { restored = list.FirstOrDefault(e => e.Id == original[0].Id); return (list.Count, 0); },
            async list => (list.Count, 0));

        Assert.NotNull(restored);
        Assert.Equal(original[0].Summary, restored!.Summary);
        Assert.Equal(original[0].Tags, restored.Tags);
    }

    [Fact]
    public async Task Export_EncryptedBackup_HasPayloadEnc()
    {
        var svc = CreateService();
        var bytes = await svc.ExportAsync(SampleEntries(), SampleSessions(),
            new BackupExportOptions(Passphrase: "s3cr3t"));

        using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        Assert.NotNull(zip.GetEntry("manifest.json"));
        Assert.NotNull(zip.GetEntry("salt.bin"));
        Assert.NotNull(zip.GetEntry("payload.enc"));
        Assert.Null(zip.GetEntry("entries.json"));
    }

    [Fact]
    public async Task EncryptedRoundTrip_WithCorrectPassphrase_Succeeds()
    {
        var svc = CreateService();
        var original = SampleEntries();
        var bytes = await svc.ExportAsync(original, SampleSessions(),
            new BackupExportOptions(Passphrase: "mypassword"));

        var importedEntries = new List<JournalEntry>();
        var result = await svc.ImportAsync(
            new MemoryStream(bytes),
            async list => { importedEntries.AddRange(list); return (list.Count, 0); },
            async list => (list.Count, 0),
            passphrase: "mypassword");

        Assert.True(result.Success);
        Assert.Equal(2, importedEntries.Count);
    }

    [Fact]
    public async Task EncryptedImport_WrongPassphrase_Fails()
    {
        var svc = CreateService();
        var bytes = await svc.ExportAsync(SampleEntries(), SampleSessions(),
            new BackupExportOptions(Passphrase: "correct"));

        var result = await svc.ImportAsync(
            new MemoryStream(bytes),
            async list => (list.Count, 0),
            async list => (list.Count, 0),
            passphrase: "wrong");

        Assert.False(result.Success);
    }

    [Fact]
    public async Task Import_NoPassphraseForEncrypted_Fails()
    {
        var svc = CreateService();
        var bytes = await svc.ExportAsync(SampleEntries(), SampleSessions(),
            new BackupExportOptions(Passphrase: "secret"));

        var result = await svc.ImportAsync(
            new MemoryStream(bytes),
            async list => (list.Count, 0),
            async list => (list.Count, 0));

        Assert.False(result.Success);
        Assert.Contains("passphrase", result.Error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ShouldRunAutoBackup_Off_ReturnsFalse()
    {
        var svc = CreateService(new BackupSettings { AutoBackupFrequency = "off" });
        Assert.False(svc.ShouldRunAutoBackup());
    }

    [Fact]
    public void ShouldRunAutoBackup_OnExit_ReturnsTrue()
    {
        var svc = CreateService(new BackupSettings { AutoBackupFrequency = "on-exit" });
        Assert.True(svc.ShouldRunAutoBackup());
    }

    [Fact]
    public void ShouldRunAutoBackup_Daily_TrueWhenOverdue()
    {
        var svc = CreateService(new BackupSettings
        {
            AutoBackupFrequency = "daily",
            LastAutoBackupUtc = DateTime.UtcNow.AddDays(-2)
        });
        Assert.True(svc.ShouldRunAutoBackup());
    }

    [Fact]
    public void ShouldRunAutoBackup_Daily_FalseWhenRecent()
    {
        var svc = CreateService(new BackupSettings
        {
            AutoBackupFrequency = "daily",
            LastAutoBackupUtc = DateTime.UtcNow.AddHours(-1)
        });
        Assert.False(svc.ShouldRunAutoBackup());
    }

    [Fact]
    public void ReadManifestFromFile_ReturnsCorrectMetadata()
    {
        var svc = CreateService();
        var entries = SampleEntries();
        var bytes = svc.ExportAsync(entries, SampleSessions(), new BackupExportOptions()).GetAwaiter().GetResult();

        var path = Path.GetTempFileName() + ".nocturn-backup";
        File.WriteAllBytes(path, bytes);

        var manifest = BackupService.ReadManifestFromFile(path);
        File.Delete(path);

        Assert.NotNull(manifest);
        Assert.Equal(2, manifest!.EntryCount);
    }
}
