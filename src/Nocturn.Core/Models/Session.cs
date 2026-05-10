namespace Nocturn.Core.Models;

public class Session
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Mode { get; set; } = "evening";  // "evening" | "dream"
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public List<JournalEntry> Entries { get; set; } = [];
}
