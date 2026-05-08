# Nocturn — Evening Diary & Dream Capture App
## Build Guide: Local-First, No MS Foundry

---

## Stack Decision

| Layer | Choice | Why |
|---|---|---|
| Model runtime | **Ollama** | Cross-platform, OpenAI-compatible API, easy model management |
| Agent / LLM wiring | **Microsoft.Extensions.AI (`IChatClient`)** | Lightweight, .NET-native, no heavy framework needed |
| Backend | **ASP.NET Core minimal API** | Simple, fast, Blazor-compatible |
| Frontend | **Blazor Server** or plain HTML + JS | Blazor if staying .NET; HTML if you want it portable |
| Storage | **SQLite via EF Core** | Zero-config, local file, no server |
| Observability (optional) | **.NET Aspire** | If you want tracing/dashboards locally |

No Semantic Kernel, no MAF, no Azure dependencies.

---

## Prerequisites

```bash
# Install Ollama
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
winget install Ollama.Ollama

# Pull a model - Llama 3.2 3B is a good balance for this use case
ollama pull llama3.2:3b

# Or for better quality at the cost of speed
ollama pull phi4-mini
ollama pull qwen2.5:7b
```

Ollama runs at `http://localhost:11434` and exposes an OpenAI-compatible endpoint at `/v1`.

---

## Project Structure

```
Nocturn/
├── Nocturn.Api/              # ASP.NET Core minimal API
│   ├── Program.cs
│   ├── Endpoints/
│   │   ├── ChatEndpoints.cs
│   │   └── EntryEndpoints.cs
│   ├── Services/
│   │   ├── DiaryAgentService.cs   # The actual agent logic
│   │   └── EntryExtractor.cs      # Parses AI summaries into entries
│   ├── Data/
│   │   ├── NocturnDbContext.cs
│   │   └── Models/
│   │       ├── Session.cs
│   │       └── JournalEntry.cs
│   └── appsettings.json
├── Nocturn.Web/              # Blazor Server or static HTML
└── Nocturn.sln
```

---

## 1. NuGet Packages

```xml






```

`Microsoft.Extensions.AI.OpenAI` gives you the `IChatClient` abstraction over the OpenAI SDK, which works directly against Ollama's OpenAI-compatible endpoint.

---

## 2. Wiring Ollama in Program.cs

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Point IChatClient at local Ollama
builder.Services.AddChatClient(services =>
    new OpenAIClient(
        new ApiKeyCredential("ollama"),          // any non-empty string
        new OpenAIClientOptions
        {
            Endpoint = new Uri("http://localhost:11434/v1")
        })
    .AsChatClient("llama3.2:3b")               // model name as deployed in Ollama
);

// SQLite
builder.Services.AddDbContext(opt =>
    opt.UseSqlite("Data Source=nocturn.db"));

builder.Services.AddScoped();
builder.Services.AddScoped();

var app = builder.Build();

// Auto-migrate on startup
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService().Database.Migrate();

app.MapChatEndpoints();
app.MapEntryEndpoints();

app.Run();
```

---

## 3. Database Models

```csharp
// Models/Session.cs
public class Session
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Mode { get; set; } = "evening";   // "evening" | "dream"
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public List Entries { get; set; } = [];
}

// Models/JournalEntry.cs
public class JournalEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public string Type { get; set; } = "evening";   // "evening" | "dream"
    public string Summary { get; set; } = "";
    public List Tags { get; set; } = [];     // moods or dream symbols
    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    public Session Session { get; set; } = null!;
}
```

---

## 4. The Agent Service

This is the core — conversation history management plus system prompt switching. No framework needed, just `IChatClient`.

```csharp
// Services/DiaryAgentService.cs
public class DiaryAgentService(IChatClient chatClient)
{
    private static readonly Dictionary SystemPrompts = new()
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

    public async IAsyncEnumerable ChatAsync(
        string mode,
        List history,
        string userMessage,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        history.Add(new ChatMessage(ChatRole.User, userMessage));

        var options = new ChatOptions
        {
            SystemMessage = SystemPrompts.GetValueOrDefault(mode, SystemPrompts["evening"])
        };

        var fullResponse = new StringBuilder();

        await foreach (var update in chatClient.CompleteStreamingAsync(history, options, ct))
        {
            var text = update.ToString();
            fullResponse.Append(text);
            yield return text;
        }

        // Append assistant response to history for next turn
        history.Add(new ChatMessage(ChatRole.Assistant, fullResponse.ToString()));
    }
}
```

---

## 5. API Endpoints

```csharp
// Endpoints/ChatEndpoints.cs
public static class ChatEndpoints
{
    // In-memory session store (swap for Redis/DB if needed)
    private static readonly ConcurrentDictionary History)>
        Sessions = new();

    public static void MapChatEndpoints(this WebApplication app)
    {
        // Start or reset a session
        app.MapPost("/sessions", (CreateSessionRequest req) =>
        {
            var id = Guid.NewGuid().ToString();
            Sessions[id] = (req.Mode, []);
            return Results.Ok(new { sessionId = id });
        });

        // Stream a chat turn
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

            // Auto-save entry if AI included markers
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

---

## 6. Entry Extractor

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

## 7. Model Recommendations

| Model | Size | Best for | Notes |
|---|---|---|---|
| `llama3.2:3b` | ~2GB RAM | Low-end hardware | Fast, decent quality |
| `phi4-mini` | ~3GB RAM | Balanced | Good reasoning, fast |
| `qwen2.5:7b` | ~5GB RAM | Quality-focused | Best reflection quality |
| `llama3.1:8b` | ~6GB RAM | High quality | Noticably better prose |

For a diary app, prose quality matters more than raw speed — `qwen2.5:7b` or `llama3.1:8b` are worth the extra RAM if available.

To switch models, just change the string in `Program.cs` — no other code changes needed.

---

## 8. Making the Model Name Configurable

```json
// appsettings.json
{
  "Ollama": {
    "Endpoint": "http://localhost:11434/v1",
    "Model": "llama3.2:3b"
  }
}
```

```csharp
// Program.cs — read from config
var ollamaConfig = builder.Configuration.GetSection("Ollama");

builder.Services.AddChatClient(services =>
    new OpenAIClient(
        new ApiKeyCredential("ollama"),
        new OpenAIClientOptions
        {
            Endpoint = new Uri(ollamaConfig["Endpoint"]!)
        })
    .AsChatClient(ollamaConfig["Model"]!)
);
```

---

## 9. Ollama Health Check on Startup

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

        var body = await resp.Content.ReadFromJsonAsync();
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

## 10. Optional: .NET Aspire for Local Observability

If you want distributed tracing and a local dashboard (no Azure needed):

```bash
dotnet workload install aspire
```

```csharp
// AppHost/Program.cs
var builder = DistributedApplication.CreateBuilder(args);
var api = builder.AddProject("api");
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

Everything runs on the user's machine. The only external step is `ollama pull ` once at install time.

---

## Distribution Checklist

- [ ] Bundle an `install.ps1` / `install.sh` that runs `ollama pull `
- [ ] Check Ollama is running before API starts (health check endpoint above)
- [ ] Ship `appsettings.json` with sensible model defaults per platform
- [ ] Consider a small Electron or WebView2 shell if you want a native-feeling desktop app
- [ ] SQLite file lives next to the binary — document its location for backups
