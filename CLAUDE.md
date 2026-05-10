# Nocturn — Evening Diary & Dream Capture App
## Build Guide: Local-First, No MS Foundry

---

## Stack Decision

| Layer | Choice | Why |
|---|---|---|
| Model runtime (desktop) | **Ollama** | Cross-platform, OpenAI-compatible API, easy model management |
| Model runtime (mobile) | **LLamaSharp** or network mode | llama.cpp .NET bindings; falls back to remote Ollama over LAN |
| Agent / LLM wiring | **Microsoft.Extensions.AI (`IChatClient`)** | Lightweight, .NET-native, no heavy framework needed |
| Inference abstraction | **`IInferenceBackend`** (custom interface) | Decouples Ollama from mobile — write this first |
| Backend | **ASP.NET Core minimal API** | Simple, fast, Blazor-compatible |
| Frontend | **Blazor Server** + **MAUI Hybrid** | Shared Razor components via RCL for desktop and mobile |
| Storage | **SQLite via EF Core** | Zero-config, local file, no server |
| Backup | **`.nocturn-backup`** (versioned ZIP + JSON) | Portable, human-readable, cross-platform migration |
| Observability (optional) | **.NET Aspire** | Local tracing/dashboards, no cloud needed |

No Semantic Kernel, no MAF, no Azure dependencies.

---

## Cross-Platform Support

| Platform | Ollama | ASP.NET Core | Blazor/MAUI | SQLite | Verdict |
|---|---|---|---|---|---|
| Windows | ✅ Native | ✅ | ✅ Blazor Server | ✅ | **Fully supported** |
| macOS | ✅ Native | ✅ | ✅ Blazor Server + MAUI Catalyst | ✅ | **Fully supported** |
| Linux | ✅ Native | ✅ | ✅ Blazor Server | ✅ | **Fully supported** |
| Android | ❌ No binary | — | ✅ MAUI Hybrid | ✅ | **Via LLamaSharp or LAN Ollama** |
| iOS | ❌ No binary | — | ✅ MAUI Hybrid | ✅ | **Via LLamaSharp or LAN Ollama** |

**Ollama does not run on Android or iOS.** Mobile inference uses one of two modes selected in settings:
- **Network mode** — connects to an Ollama instance on the user's LAN (e.g. home desktop). Covers most real-world use.
- **Local mode** — uses `LLamaSharp` with a user-supplied `.gguf` model file. Q4-quantized 3B models (~1.8 GB) run on modern phones.

The key design decision that makes this work: define `IInferenceBackend` in `Nocturn.Core` before writing any other service code. Desktop wires `OllamaBackend`; mobile wires `LLamaSharpBackend`. No other code changes.

---

## Prerequisites

```bash
# Install Ollama (desktop only)
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
winget install Ollama.Ollama

# Pull a model - Llama 3.2 3B is a good balance for this use case
ollama pull llama3.2:3b

# Or for better quality at the cost of speed
ollama pull phi4-mini
ollama pull qwen2.5:7b

# Install .NET MAUI workload (required for mobile builds)
dotnet workload install maui
```

Ollama runs at `http://localhost:11434` and exposes an OpenAI-compatible endpoint at `/v1`.

For mobile local mode: download a `.gguf` model file (e.g. `llama-3.2-3b-instruct-q4_k_m.gguf`) and point the app at it in Settings → Inference.

---

## Project Structure

```
Nocturn/
├── Nocturn.sln
│
├── src/
│   ├── Nocturn.Core/                   # Pure .NET — no UI, no Ollama-specific code
│   │   ├── Interfaces/
│   │   │   ├── IInferenceBackend.cs    # ← write this first, everything depends on it
│   │   │   └── IBackupProvider.cs
│   │   ├── Models/
│   │   │   ├── Session.cs
│   │   │   ├── JournalEntry.cs
│   │   │   └── AppSettings.cs          # Includes BackupSettings
│   │   └── Services/
│   │       ├── DiaryAgentService.cs    # Agent logic — uses IInferenceBackend
│   │       ├── EntryExtractor.cs       # Parses AI summary markers into entries
│   │       └── BackupService.cs        # ZIP generation, AES-256-GCM, import/upsert
│   │
│   ├── Nocturn.Data/                   # EF Core + SQLite + migrations
│   │   ├── NocturnDbContext.cs
│   │   └── Migrations/
│   │
│   ├── Nocturn.Api/                    # ASP.NET Core minimal API (desktop host)
│   │   ├── Program.cs
│   │   ├── Backends/
│   │   │   └── OllamaBackend.cs        # IInferenceBackend implementation for desktop
│   │   ├── Endpoints/
│   │   │   ├── ChatEndpoints.cs
│   │   │   ├── EntryEndpoints.cs
│   │   │   └── BackupEndpoints.cs
│   │   └── appsettings.json
│   │
│   ├── Nocturn.SharedUI/               # Razor Class Library — shared Blazor components
│   │   └── Components/
│   │       ├── Chat/
│   │       ├── Journal/
│   │       └── Settings/               # Includes BackupSettingsPanel.razor
│   │
│   ├── Nocturn.Web/                    # Blazor Server (desktop browser access)
│   │   └── Program.cs
│   │
│   └── Nocturn.Mobile/                 # MAUI Hybrid (iOS + Android + macOS Catalyst)
│       ├── MauiProgram.cs              # DI root: picks OllamaBackend vs LLamaSharpBackend
│       ├── Backends/
│       │   └── LLamaSharpBackend.cs    # IInferenceBackend implementation for mobile
│       └── Platforms/
│           ├── Android/
│           └── iOS/
│
└── tests/
    ├── Nocturn.Core.Tests/
    └── Nocturn.Api.Tests/
```

---

## 1. NuGet Packages

### Core / API (all platforms)

```xml
<PackageReference Include="Microsoft.Extensions.AI" Version="9.*" />
<PackageReference Include="Microsoft.Extensions.AI.OpenAI" Version="9.*" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="9.*" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="9.*" />
<PackageReference Include="OpenAI" Version="2.*" />
```

### Mobile (Nocturn.Mobile)

```xml
<PackageReference Include="Microsoft.AspNetCore.Components.WebView.Maui" Version="9.*" />
<PackageReference Include="LLamaSharp" Version="0.18.*" />
<PackageReference Include="LLamaSharp.Backend.Cpu" Version="0.18.*" />       <!-- Windows/Linux fallback -->
<PackageReference Include="LLamaSharp.Backend.Metal" Version="0.18.*" />     <!-- macOS + Apple Silicon iOS -->
<PackageReference Include="LLamaSharp.Backend.Cuda12" Version="0.18.*" />    <!-- Windows with Nvidia GPU -->
<PackageReference Include="Microsoft.Maui.Essentials" Version="9.*" />       <!-- FolderPicker, FilePicker -->
```

### Testing

```xml
<PackageReference Include="xunit" Version="2.*" />
<PackageReference Include="NSubstitute" Version="5.*" />
<PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="9.*" />
```

Backup crypto (`AesGcm`, `Rfc2898DeriveBytes`, `ZipArchive`) is in the .NET BCL — no extra packages needed.

`Microsoft.Extensions.AI.OpenAI` gives you the `IChatClient` abstraction over the OpenAI SDK, which works directly against Ollama's OpenAI-compatible endpoint.

---

## 2. IInferenceBackend Abstraction

Define this in `Nocturn.Core` before anything else. It's the seam between Ollama (desktop) and LLamaSharp (mobile).

```csharp
// Nocturn.Core/Interfaces/IInferenceBackend.cs
public interface IInferenceBackend
{
    IAsyncEnumerable<string> CompleteStreamingAsync(
        string mode,
        IList<ChatMessage> history,
        string userMessage,
        CancellationToken ct = default);
}
```

`OllamaBackend` (in `Nocturn.Api`) wraps `IChatClient` pointing at Ollama. `LLamaSharpBackend` (in `Nocturn.Mobile`) wraps `LLamaWeights` + `StatelessExecutor`. `DiaryAgentService` depends on `IInferenceBackend` only — it never imports Ollama or LLamaSharp directly.

---

## 3. Wiring Ollama in Program.cs

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

var ollamaConfig = builder.Configuration.GetSection("Ollama");

// OllamaBackend implements IInferenceBackend using IChatClient
builder.Services.AddChatClient(services =>
    new OpenAIClient(
        new ApiKeyCredential("ollama"),          // any non-empty string
        new OpenAIClientOptions
        {
            Endpoint = new Uri(ollamaConfig["Endpoint"]!)
        })
    .AsChatClient(ollamaConfig["Model"]!)
);

builder.Services.AddScoped<IInferenceBackend, OllamaBackend>();

// SQLite
builder.Services.AddDbContext<NocturnDbContext>(opt =>
    opt.UseSqlite("Data Source=nocturn.db"));

builder.Services.AddScoped<DiaryAgentService>();
builder.Services.AddScoped<EntryExtractor>();
builder.Services.AddScoped<BackupService>();
builder.Services.AddHostedService<AutoBackupHostedService>();

var app = builder.Build();

// Auto-migrate on startup
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<NocturnDbContext>().Database.Migrate();

app.MapChatEndpoints();
app.MapEntryEndpoints();
app.MapBackupEndpoints();

app.Run();
```

---

## 4. AppSettings & BackupSettings

Settings are persisted as a JSON file (not EF Core) in the OS user-config directory.

```csharp
// Nocturn.Core/Models/AppSettings.cs
public class AppSettings
{
    public string OllamaEndpoint { get; set; } = "http://localhost:11434/v1";
    public string ModelName { get; set; } = "llama3.2:3b";
    public string InferenceMode { get; set; } = "ollama";   // "ollama" | "local"
    public string LocalModelPath { get; set; } = "";        // Path to .gguf file (local mode)
    public BackupSettings Backup { get; set; } = new();
}

public class BackupSettings
{
    // "off" | "on-exit" | "daily" | "weekly"
    public string AutoBackupFrequency { get; set; } = "off";

    // User can point this at an OneDrive / Google Drive / iCloud Drive sync folder
    public string BackupFolderPath { get; set; } = DefaultBackupPath();

    // Oldest files pruned first when limit is exceeded
    public int MaxBackupsToKeep { get; set; } = 10;

    public bool IncludeRawTranscripts { get; set; } = false;
    public bool IncludeSettings { get; set; } = true;
    public bool EncryptBackups { get; set; } = false;

    // Updated after every successful auto-backup
    public DateTime? LastAutoBackupUtc { get; set; }

    private static string DefaultBackupPath() =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "Nocturn", "Backups");
}
```

```json
// appsettings.json
{
  "Ollama": {
    "Endpoint": "http://localhost:11434/v1",
    "Model": "llama3.2:3b"
  }
}
```

To switch models, change `Model` in `appsettings.json` — no other code changes needed.

---

## 5. Database Models

```csharp
// Models/Session.cs
public class Session
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Mode { get; set; } = "evening";   // "evening" | "dream"
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public List<JournalEntry> Entries { get; set; } = [];
}

// Models/JournalEntry.cs
public class JournalEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public string Type { get; set; } = "evening";   // "evening" | "dream"
    public string Summary { get; set; } = "";
    public List<string> Tags { get; set; } = [];    // moods or dream symbols
    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    public Session Session { get; set; } = null!;
}
```

---

## 6. The Agent Service

Depends on `IInferenceBackend` — works identically on desktop (Ollama) and mobile (LLamaSharp).

```csharp
// Services/DiaryAgentService.cs
public class DiaryAgentService(IInferenceBackend backend)
{
    private static readonly Dictionary<string, string> SystemPrompts = new()
    {
        ["evening"] = """
            You are Nocturn, a gentle evening journal companion. Guide the user through 
            meaningful end-of-day reflection. Ask warm open-ended questions about their day — 
            what moved them, challenged them, surprised them. After 3-5 exchanges, when you 
            have enough to summarize, end your message with:
            [ENTRY: one sentence summary of their day]
            [MOODS: comma, separated, mood, words]
            Keep responses to 2-4 sentences. Be warm and poetic, not clinical.
            """,

        ["dream"] = """
            You are Nocturn, a dream archivist. Help capture dream fragments before they fade. 
            Ask gentle questions about images, feelings, colors, people. After capturing enough 
            detail, end your message with:
            [DREAM_ENTRY: one evocative sentence describing the dream]
            [SYMBOLS: comma, separated, dream, symbols]
            Keep responses brief and wonder-filled. Dreams are fragile — handle with care.
            """
    };

    public IAsyncEnumerable<string> ChatAsync(
        string mode,
        List<ChatMessage> history,
        string userMessage,
        CancellationToken ct = default)
        => backend.CompleteStreamingAsync(mode, history, userMessage, ct);
}
```

---

## 7. API Endpoints

### Chat Endpoints

```csharp
// Endpoints/ChatEndpoints.cs
public static class ChatEndpoints
{
    private static readonly ConcurrentDictionary<string, (string Mode, List<ChatMessage> History)>
        Sessions = new();

    public static void MapChatEndpoints(this WebApplication app)
    {
        app.MapPost("/sessions", (CreateSessionRequest req) =>
        {
            var id = Guid.NewGuid().ToString();
            Sessions[id] = (req.Mode, []);
            return Results.Ok(new { sessionId = id });
        });

        app.MapPost("/sessions/{id}/chat", async (
            string id,
            ChatRequest req,
            DiaryAgentService agent,
            EntryExtractor extractor,
            NocturnDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            if (!Sessions.TryGetValue(id, out var session))
                return Results.NotFound();

            http.Response.ContentType = "text/event-stream";
            http.Response.Headers.CacheControl = "no-cache";

            var fullText = new StringBuilder();

            await foreach (var chunk in agent.ChatAsync(
                session.Mode, session.History, req.Message, ct))
            {
                fullText.Append(chunk);
                await http.Response.WriteAsync($"data: {chunk}\n\n", ct);
                await http.Response.Body.FlushAsync(ct);
            }

            var entry = extractor.TryExtract(session.Mode, fullText.ToString());
            if (entry is not null)
            {
                db.JournalEntries.Add(entry);
                await db.SaveChangesAsync(ct);
                await http.Response.WriteAsync($"event: entry\ndata: {entry.Id}\n\n", ct);
            }

            return Results.Empty;
        });
    }
}

public record CreateSessionRequest(string Mode);
public record ChatRequest(string Message);
```

### Backup Endpoints

```
POST   /backup/export          → streams .nocturn-backup file download
POST   /backup/import          → multipart upload, upsert-by-Guid
GET    /backup/list            → list files (reads manifest only, fast)
DELETE /backup/{filename}      → delete a backup file
GET    /backup/settings        → read BackupSettings
PUT    /backup/settings        → update settings (validates folder is writable)
POST   /backup/trigger         → run auto-backup on demand
```

Import conflict strategy: upsert by `Id` (Guid). Existing records win by default — pass `overwrite: true` in the request body to override. No accidental data loss.

---

## 8. Entry Extractor

```csharp
// Services/EntryExtractor.cs
public class EntryExtractor
{
    private static readonly Regex EntryPattern =
        new(@"\[ENTRY:\s*([^\]]+)\]", RegexOptions.IgnoreCase);
    private static readonly Regex MoodsPattern =
        new(@"\[MOODS:\s*([^\]]+)\]", RegexOptions.IgnoreCase);
    private static readonly Regex DreamPattern =
        new(@"\[DREAM_ENTRY:\s*([^\]]+)\]", RegexOptions.IgnoreCase);
    private static readonly Regex SymbolsPattern =
        new(@"\[SYMBOLS:\s*([^\]]+)\]", RegexOptions.IgnoreCase);

    public JournalEntry? TryExtract(string mode, string text)
    {
        var isDream = mode == "dream";
        var summaryMatch = isDream
            ? DreamPattern.Match(text)
            : EntryPattern.Match(text);

        if (!summaryMatch.Success) return null;

        var tagsMatch = isDream
            ? SymbolsPattern.Match(text)
            : MoodsPattern.Match(text);

        var tags = tagsMatch.Success
            ? tagsMatch.Groups[1].Value
                .Split(',')
                .Select(t => t.Trim())
                .Where(t => !string.IsNullOrEmpty(t))
                .ToList()
            : [];

        return new JournalEntry
        {
            Type = mode,
            Summary = summaryMatch.Groups[1].Value.Trim(),
            Tags = tags,
            CapturedAt = DateTime.UtcNow
        };
    }
}
```

---

## 9. Backup Feature

### File Format

A `.nocturn-backup` file is a ZIP archive internally. Deliberately boring — openable with any ZIP tool when unencrypted.

```
nocturn-backup-20260508T143000Z.nocturn-backup   (ZIP)
├── manifest.json      # Plaintext always — version, date, entry count, encrypted flag
├── entries.json       # All JournalEntry records
├── sessions.json      # All Session records
└── settings.json      # Optional — user preferences
```

`manifest.json`:
```json
{
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "createdAtUtc": "2026-05-08T14:30:00Z",
  "platform": "win32",
  "entryCount": 142,
  "sessionCount": 89,
  "includesSettings": true,
  "encrypted": false
}
```

`entries.json` (array):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "sessionId": "...",
    "type": "evening",
    "summary": "A quiet day of focused work...",
    "tags": ["calm", "productive", "grateful"],
    "capturedAtUtc": "2026-05-08T21:15:00Z"
  }
]
```

**Versioning:** `formatVersion` is bumped only on breaking schema changes. The import code applies a migration chain (v1→v2→...) before hydrating — backups from old versions always restore cleanly.

### Encryption (opt-in)

- User supplies a passphrase at export time — never stored anywhere.
- PBKDF2-HMAC-SHA256 (600k iterations) derives a 256-bit key from passphrase + random 32-byte salt.
- AES-256-GCM encrypts everything except `manifest.json` (stays plaintext for metadata reads).
- Encrypted layout: `manifest.json` (plaintext) + `salt.bin` + `payload.enc`.
- All crypto uses .NET BCL only: `System.Security.Cryptography.AesGcm`, `Rfc2898DeriveBytes`. No third-party packages.

### Auto-Backup Triggers

- **On-exit (desktop):** `IHostApplicationLifetime.ApplicationStopping`
- **Daily/Weekly (desktop):** `AutoBackupHostedService` (`BackgroundService`) with `PeriodicTimer`, checks elapsed time since `LastAutoBackupUtc`
- **On-sleep (mobile):** MAUI `ILifecycleBuilder.OnSleep` → `BackupService.RunIfDueAsync()`

### Cloud Backup (Zero Integration Required)

Point `BackupFolderPath` at any cloud-synced folder the OS already manages:
- Windows: `%UserProfile%\OneDrive\Nocturn Backups`
- macOS/iOS: `~/Library/Mobile Documents/com~apple~CloudDocs/Nocturn Backups`
- Any platform: Dropbox / Google Drive sync folder

The app writes files to the path. The cloud client handles the upload. No API keys, no OAuth.

---

## 10. Model Recommendations

| Model | Size | Best for | Notes |
|---|---|---|---|
| `llama3.2:3b` | ~2GB RAM | Low-end hardware | Fast, decent quality |
| `phi4-mini` | ~3GB RAM | Balanced | Good reasoning, fast |
| `qwen2.5:7b` | ~5GB RAM | Quality-focused | Best reflection quality |
| `llama3.1:8b` | ~6GB RAM | High quality | Noticeably better prose |

For a diary app, prose quality matters more than raw speed — `qwen2.5:7b` or `llama3.1:8b` are worth the extra RAM if available.

**For mobile local mode (LLamaSharp):** use Q4_K_M quantized GGUF files. A `llama-3.2-3b-q4_k_m.gguf` is ~1.8 GB on disk and needs ~1.2 GB RAM — feasible on phones with 6 GB+ RAM.

---

## 11. Ollama Health Check on Startup

```csharp
// Program.cs — before app.Run()
app.MapGet("/health/model", async (IConfiguration config) =>
{
    var endpoint = config["Ollama:Endpoint"]!.Replace("/v1", "");
    try
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        var resp = await http.GetAsync($"{endpoint}/api/tags");
        if (!resp.IsSuccessStatusCode) return Results.Problem("Ollama not responding");

        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
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
```

---

## 12. MAUI Mobile Shell (MauiProgram.cs)

```csharp
// Nocturn.Mobile/MauiProgram.cs
public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();

        builder.Services.AddMauiBlazorWebView();

        // Load settings to pick inference mode
        var settings = LoadSettings();

        if (settings.InferenceMode == "local" && File.Exists(settings.LocalModelPath))
            builder.Services.AddSingleton<IInferenceBackend>(
                new LLamaSharpBackend(settings.LocalModelPath));
        else
            // Network mode: calls Ollama on user's configured host
            builder.Services.AddSingleton<IInferenceBackend>(
                new NetworkInferenceBackend(settings.OllamaEndpoint, settings.ModelName));

        builder.Services.AddSingleton<AppSettings>(settings);
        builder.Services.AddScoped<DiaryAgentService>();
        builder.Services.AddScoped<EntryExtractor>();
        builder.Services.AddScoped<BackupService>();

        // On-sleep auto-backup hook
        builder.ConfigureLifecycleEvents(lifecycle =>
        {
#if ANDROID
            lifecycle.AddAndroid(android => android
                .OnStop((activity) => TriggerBackupIfDue(activity)));
#elif IOS
            lifecycle.AddiOS(ios => ios
                .WillResignActive((app) => TriggerBackupIfDue(app)));
#endif
        });

        return builder.Build();
    }
}
```

---

## 13. Optional: .NET Aspire for Local Observability

If you want distributed tracing and a local dashboard (no Azure needed):

```bash
dotnet workload install aspire
```

```csharp
// AppHost/Program.cs
var builder = DistributedApplication.CreateBuilder(args);
var api = builder.AddProject<Projects.Nocturn_Api>("api");
builder.Build().Run();
```

Gives you a local dashboard at `http://localhost:15888` showing request traces, latency, and logs. Entirely local, no cloud account required.

---

## What You're NOT Using

- ❌ MS Foundry / Azure AI Foundry
- ❌ Foundry Local
- ❌ Microsoft Agent Framework (MAF)
- ❌ Semantic Kernel
- ❌ AutoGen
- ❌ Any Azure service
- ❌ Any API key or cloud account

Everything runs on the user's machine. The only external step is `ollama pull <model>` once at install time (desktop), or downloading a `.gguf` file once (mobile local mode).

---

## Frontend

**React + Vite + Mantine** (replaces the originally planned Blazor stack).  
Project lives in `nocturn-web/`. Calls `Nocturn.Api` over HTTP.

```
nocturn-web/
├── src/
│   ├── api/client.ts          # All API calls (sessions, entries, backup, health)
│   ├── components/
│   │   ├── AppShell.tsx       # Nav sidebar + layout
│   │   ├── ChatPanel.tsx      # SSE streaming chat UI
│   │   └── ModelStatus.tsx    # Ollama health badge
│   └── pages/
│       ├── EveningPage.tsx
│       ├── DreamPage.tsx
│       ├── JournalPage.tsx
│       └── SettingsPage.tsx   # Backup settings + export/import/history
├── .env                       # VITE_API_URL=http://localhost:5000
└── vite.config.ts             # Dev proxy → API
```

Start dev: `cd nocturn-web && npm run dev`  
Start API: `cd src/Nocturn.Api && dotnet run`

## Mobile Plan (React Native)

For Android/iOS, the plan is **React Native** sharing the same `Nocturn.Api` backend. Mobile-specific concerns:

- **Inference**: `llama.rn` (llama.cpp wrapper) for offline local mode; network mode connects to Ollama on LAN
- **UI**: React Native Paper (no Tailwind, consistent with web aesthetic)  
- **Storage**: SQLite via `expo-sqlite` — same schema as desktop, portable via `.nocturn-backup` format
- **Backup**: uses the same `POST /backup/export` and `POST /backup/import` API endpoints
- **`IInferenceBackend`** on the .NET side remains the seam — mobile inference is client-side (llama.rn), not server-side

---

## Distribution Checklist

### Phase 1 — Backend + Web UI ✅
- [x] Create solution: `Nocturn.Core`, `Nocturn.Data`, `Nocturn.Api`
- [x] Define `IInferenceBackend` in `Nocturn.Core`
- [x] Implement `OllamaBackend : IInferenceBackend` in `Nocturn.Api`
- [x] `DiaryAgentService` and `EntryExtractor` in `Nocturn.Core`
- [x] EF Core migrations in `Nocturn.Data`
- [x] `AppSettings` + `BackupSettings` JSON persistence
- [x] React + Vite + Mantine frontend (`nocturn-web/`)
- [x] Chat UI with SSE streaming (`ChatPanel.tsx`)
- [x] Journal list with filter by type (`JournalPage.tsx`)
- [x] Ollama health status badge in sidebar
- [ ] Model selection in Settings page
- [ ] `install.ps1` / `install.sh` (installs .NET + Ollama + pulls default model)

### Phase 2 — Backup Feature ✅
- [x] `BackupService` — ZIP, AES-256-GCM, import upsert, manifest
- [x] All 7 `BackupEndpoints` in `Nocturn.Api`
- [x] `AutoBackupHostedService` with `PeriodicTimer`
- [x] On-exit backup hook via `IHostApplicationLifetime`
- [x] Backup settings UI (`SettingsPage.tsx`) — folder, frequency, encrypt, export/import, history
- [ ] Format-version migration harness (v1→vN upgrade chain)
- [ ] Document backup folder + cloud sync instructions in README

### Phase 3 — React Native Mobile ✅
- [x] Init Expo + TypeScript project (`nocturn-mobile/`)
- [x] `llama.rn` integration for local offline inference (`src/inference/InferenceClient.ts`)
- [x] Network mode: connect to Ollama/API host over LAN (configurable IP in Settings)
- [x] `useChat` hook with SSE streaming, shared with both inference modes
- [x] `useSettings` hook with AsyncStorage persistence
- [x] Chat screen (Evening + Dream), Journal screen, Settings screen
- [x] Bottom tab navigation with dark Nocturn theme (React Native Paper)
- [x] Backup export → file written to device + shared via OS share sheet
- [x] Backup import → file picker → POST to API
- [x] Auto-backup on app background toggle
- [ ] App backgrounding → `AppState` listener → trigger backup if due
- [ ] Test on Android emulator + iOS simulator
- [ ] Test local mode with Q4_K_M 3B GGUF on real device
- [ ] EAS Build config for distributing custom dev build (needed for llama.rn native module)

### Phase 4 — Polish & Distribution
- [ ] Model download manager in mobile Settings (progress, disk space check)
- [ ] Markdown / plain-text diary export
- [ ] `install.ps1` / `install.sh` for desktop setup
- [ ] Document SQLite file location for manual backup
- [ ] Optional .NET Aspire integration for power users
