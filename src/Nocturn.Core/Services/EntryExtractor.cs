using Nocturn.Core.Models;
using System.Text.RegularExpressions;

namespace Nocturn.Core.Services;

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

    public JournalEntry? TryExtract(string mode, string text, string? rawTranscript = null)
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
            CapturedAt = DateTime.UtcNow,
            RawTranscript = rawTranscript
        };
    }
}
