using Nocturn.Api.Services;
using Nocturn.Core.Models;
using System.Diagnostics;
using System.Text.Json;

namespace Nocturn.Api.Endpoints;

public record AvailableModel(
    string Name,
    string Label,
    double RamGb,
    string Description,
    string BestFor,
    bool Recommended = false);

public static class ModelEndpoints
{
    private static readonly AvailableModel[] Catalog =
    [
        new("llama3.2:1b",  "Llama 3.2 · 1B",  1.0, "Very fast, basic quality",       "Low-end phones & old hardware"),
        new("llama3.2:3b",  "Llama 3.2 · 3B",  2.0, "Fast, solid diary quality",      "Most laptops & modern phones",      Recommended: true),
        new("phi4-mini",    "Phi-4 Mini",       3.0, "Great reasoning, fast replies",  "Mid-range devices (6 GB+ RAM)"),
        new("qwen2.5:7b",   "Qwen 2.5 · 7B",   5.0, "High-quality reflection prose",  "Desktop with 8 GB+ RAM"),
        new("llama3.1:8b",  "Llama 3.1 · 8B",  6.0, "Best prose — poetic & nuanced",  "Desktop with 8 GB+ RAM"),
    ];

    public static void MapModelEndpoints(this WebApplication app)
    {
        // List models available to download
        app.MapGet("/models/available", () => Results.Ok(Catalog));

        // List models installed in Ollama
        app.MapGet("/models/installed", async (IConfiguration config, CancellationToken ct) =>
        {
            var endpoint = OllamaBase(config);
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                var resp = await http.GetAsync($"{endpoint}/api/tags", ct);
                if (!resp.IsSuccessStatusCode) return Results.Ok(Array.Empty<string>());
                var body = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
                var names = body.GetProperty("models")
                    .EnumerateArray()
                    .Select(m => m.GetProperty("name").GetString())
                    .ToArray();
                return Results.Ok(names);
            }
            catch { return Results.Ok(Array.Empty<string>()); }
        });

        // Stream pull progress as SSE
        app.MapPost("/models/pull/{name}", async (
            string name,
            IConfiguration config,
            HttpContext http,
            CancellationToken ct) =>
        {
            http.Response.ContentType = "text/event-stream";
            http.Response.Headers.CacheControl = "no-cache";

            var endpoint = OllamaBase(config);
            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };

            var pullReq = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/api/pull")
            {
                Content = JsonContent.Create(new { name })
            };

            using var resp = await client.SendAsync(pullReq,
                HttpCompletionOption.ResponseHeadersRead, ct);

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            while (!reader.EndOfStream && !ct.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(ct);
                if (string.IsNullOrEmpty(line)) continue;
                await http.Response.WriteAsync($"data: {line}\n\n", ct);
                await http.Response.Body.FlushAsync(ct);
            }

            return Results.Empty;
        });

        // Delete a model
        app.MapDelete("/models/{name}", async (string name, IConfiguration config, CancellationToken ct) =>
        {
            var endpoint = OllamaBase(config);
            using var client = new HttpClient();
            var req = new HttpRequestMessage(HttpMethod.Delete, $"{endpoint}/api/delete")
            {
                Content = JsonContent.Create(new { name })
            };
            var resp = await client.SendAsync(req, ct);
            return resp.IsSuccessStatusCode ? Results.NoContent() : Results.Problem("Failed to delete model");
        });

        // Set active model — persists to settings, takes effect on next chat request
        app.MapPut("/models/active", async (
            SetActiveModelRequest req,
            AppSettings settings,
            CancellationToken ct) =>
        {
            settings.ModelName = req.Name;
            await AppSettingsStore.SaveAsync(settings, ct);
            return Results.Ok(new { active = req.Name });
        });
    }

    private static string OllamaBase(IConfiguration config) =>
        (config["Ollama:Endpoint"] ?? "http://localhost:11434/v1").Replace("/v1", "");
}

public record SetActiveModelRequest(string Name);
