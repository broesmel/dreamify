using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Nocturn.Core.Models;

namespace Nocturn.Data;

public class NocturnDbContext(DbContextOptions<NocturnDbContext> options) : DbContext(options)
{
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Session>()
            .HasMany(s => s.Entries)
            .WithOne(e => e.Session)
            .HasForeignKey(e => e.SessionId);

        modelBuilder.Entity<JournalEntry>()
            .Property(e => e.Tags)
            .HasConversion(
                tags => string.Join(',', tags),
                value => value.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
                new ValueComparer<List<string>>(
                    (a, b) => a != null && b != null && a.SequenceEqual(b),
                    c => c.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
                    c => c.ToList()));
    }
}
