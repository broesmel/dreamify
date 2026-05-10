using Microsoft.EntityFrameworkCore;
using Nocturn.Data;

namespace Nocturn.Api.Endpoints;

public static class EntryEndpoints
{
    public static void MapEntryEndpoints(this WebApplication app)
    {
        app.MapGet("/entries", async (NocturnDbContext db, string? type, CancellationToken ct) =>
        {
            var query = db.JournalEntries.AsQueryable();
            if (type is not null)
                query = query.Where(e => e.Type == type);
            var entries = await query.OrderByDescending(e => e.CapturedAt).ToListAsync(ct);
            return Results.Ok(entries);
        });

        app.MapGet("/entries/{id:guid}", async (Guid id, NocturnDbContext db, CancellationToken ct) =>
        {
            var entry = await db.JournalEntries.FindAsync([id], ct);
            return entry is not null ? Results.Ok(entry) : Results.NotFound();
        });

        app.MapDelete("/entries/{id:guid}", async (Guid id, NocturnDbContext db, CancellationToken ct) =>
        {
            var entry = await db.JournalEntries.FindAsync([id], ct);
            if (entry is null) return Results.NotFound();
            db.JournalEntries.Remove(entry);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
