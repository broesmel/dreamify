using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Nocturn.Api.Backends;
using Nocturn.Api.Endpoints;
using Nocturn.Api.Services;
using Nocturn.Core.Interfaces;
using Nocturn.Core.Models;
using Nocturn.Core.Services;
using Nocturn.Data;
using OpenAI;
using System.ClientModel;

var builder = WebApplication.CreateBuilder(args);

var appSettings = AppSettingsStore.Load();
builder.Services.AddSingleton(appSettings);

// OpenAI.Chat.ChatClient pointed at Ollama's OpenAI-compatible endpoint
builder.Services.AddChatClient(
    new OpenAIClient(
        new ApiKeyCredential("ollama"),
        new OpenAIClientOptions { Endpoint = new Uri(appSettings.OllamaEndpoint) })
    .GetChatClient(appSettings.ModelName)
    .AsIChatClient());

builder.Services.AddScoped<IInferenceBackend, OllamaBackend>();
builder.Services.AddScoped<DiaryAgentService>();
builder.Services.AddScoped<EntryExtractor>();
builder.Services.AddScoped<BackupService>();
builder.Services.AddHostedService<AutoBackupHostedService>();

builder.Services.AddDbContext<NocturnDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("Default")
        ?? "Data Source=nocturn.db"));

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<NocturnDbContext>().Database.Migrate();

var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(async () =>
{
    if (appSettings.Backup.AutoBackupFrequency != "on-exit") return;
    using var scope = app.Services.CreateScope();
    var backup = scope.ServiceProvider.GetRequiredService<BackupService>();
    if (!backup.ShouldRunAutoBackup()) return;

    var db = scope.ServiceProvider.GetRequiredService<NocturnDbContext>();
    var entries = await db.JournalEntries.ToListAsync();
    var sessions = await db.Sessions.ToListAsync();
    var opts = new BackupExportOptions(
        appSettings.Backup.IncludeRawTranscripts, appSettings.Backup.IncludeSettings);
    var bytes = await backup.ExportAsync(entries, sessions, opts);

    Directory.CreateDirectory(appSettings.Backup.BackupFolderPath);
    var filename = $"nocturn-backup-{DateTime.UtcNow:yyyyMMddTHHmmssZ}.nocturn-backup";
    await File.WriteAllBytesAsync(Path.Combine(appSettings.Backup.BackupFolderPath, filename), bytes);
    appSettings.Backup.LastAutoBackupUtc = DateTime.UtcNow;
    await AppSettingsStore.SaveAsync(appSettings);
    backup.PruneOldBackups();
});

app.UseCors();
app.MapChatEndpoints();
app.MapEntryEndpoints();
app.MapBackupEndpoints();

app.Run();
