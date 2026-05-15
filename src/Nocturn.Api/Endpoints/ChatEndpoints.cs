using Microsoft.Extensions.AI;
using Nocturn.Core.Models;
using Nocturn.Core.Services;
using Nocturn.Data;
using System.Collections.Concurrent;
using System.Text;

namespace Nocturn.Api.Endpoints;

public static class ChatEndpoints
{
    private static readonly ConcurrentDictionary<Guid, (string Mode, List<ChatMessage> History)>
        InMemorySessions = new();

    public static void MapChatEndpoints(this WebApplication app)
    {
        app.MapPost("/sessions", async (CreateSessionRequest req, NocturnDbContext db, CancellationToken ct) =>
        {
            var session = new Session { Mode = req.Mode };
            db.Sessions.Add(session);
            await db.SaveChangesAsync(ct);

            InMemorySessions[session.Id] = (req.Mode, []);
            return Results.Ok(new { sessionId = session.Id });
        });

        app.MapDelete("/sessions/{id:guid}", (Guid id) =>
        {
            InMemorySessions.TryRemove(id, out _);
            return Results.NoContent();
        });

        app.MapPost("/sessions/{id:guid}/chat", async (
            Guid id,
            ChatRequest req,
            DiaryAgentService agent,
            EntryExtractor extractor,
            NocturnDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            if (!InMemorySessions.TryGetValue(id, out var session))
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

            var transcript = BuildTranscript(session.History);
            var entry = extractor.TryExtract(session.Mode, fullText.ToString(), transcript);
            if (entry is not null)
            {
                entry.SessionId = id;
                db.JournalEntries.Add(entry);
                await db.SaveChangesAsync(ct);
                await http.Response.WriteAsync($"event: entry\ndata: {entry.Id}\n\n", ct);
                await http.Response.Body.FlushAsync(ct);
            }

            return Results.Empty;
        });
    }

    private static string BuildTranscript(List<ChatMessage> history)
    {
        var sb = new StringBuilder();
        foreach (var msg in history)
        {
            var role = msg.Role == ChatRole.User ? "User" : "Nocturn";
            sb.AppendLine($"{role}: {msg.Text}");
        }
        return sb.ToString();
    }
}

public record CreateSessionRequest(string Mode);
public record ChatRequest(string Message);
