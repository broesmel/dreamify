using Microsoft.Extensions.AI;
using Nocturn.Core.Services;
using Nocturn.Data;
using System.Collections.Concurrent;
using System.Text;

namespace Nocturn.Api.Endpoints;

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

        app.MapDelete("/sessions/{id}", (string id) =>
        {
            Sessions.TryRemove(id, out _);
            return Results.NoContent();
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

            await foreach (var chunk in agent.ChatAsync(session.Mode, session.History, req.Message, ct))
            {
                fullText.Append(chunk);
                await http.Response.WriteAsync($"data: {chunk}\n\n", ct);
                await http.Response.Body.FlushAsync(ct);
            }

            var entry = extractor.TryExtract(session.Mode, fullText.ToString());
            if (entry is not null)
            {
                entry.SessionId = Guid.Parse(id.Length == 36 ? id : Guid.NewGuid().ToString());
                db.JournalEntries.Add(entry);
                await db.SaveChangesAsync(ct);
                await http.Response.WriteAsync($"event: entry\ndata: {entry.Id}\n\n", ct);
                await http.Response.Body.FlushAsync(ct);
            }

            return Results.Empty;
        });
    }
}

public record CreateSessionRequest(string Mode);
public record ChatRequest(string Message);
