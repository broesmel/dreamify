using Nocturn.Core.Models;
using System.Text.Json;

namespace Nocturn.Api.Services;

public static class AppSettingsStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public static AppSettings Load()
    {
        var path = AppSettings.SettingsFilePath;
        if (!File.Exists(path)) return new AppSettings();
        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    public static async Task SaveAsync(AppSettings settings, CancellationToken ct = default)
    {
        var path = AppSettings.SettingsFilePath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = JsonSerializer.Serialize(settings, JsonOpts);
        await File.WriteAllTextAsync(path, json, ct);
    }
}
