namespace Nocturn.Core.Models;

public class JournalEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public string Type { get; set; } = "evening";  // "evening" | "dream"
    public string Summary { get; set; } = "";
    public List<string> Tags { get; set; } = [];
    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    public string? RawTranscript { get; set; }
    public Session Session { get; set; } = null!;
}
