using Nocturn.Core.Services;

namespace Nocturn.Core.Tests;

public class EntryExtractorTests
{
    private readonly EntryExtractor _extractor = new();

    [Fact]
    public void TryExtract_EveningMode_ParsesSummaryAndMoods()
    {
        var text = "Great chat! [ENTRY: Had a peaceful productive day] [MOODS: calm, focused, grateful]";
        var entry = _extractor.TryExtract("evening", text);

        Assert.NotNull(entry);
        Assert.Equal("Had a peaceful productive day", entry!.Summary);
        Assert.Equal(["calm", "focused", "grateful"], entry.Tags);
        Assert.Equal("evening", entry.Type);
    }

    [Fact]
    public void TryExtract_DreamMode_ParsesDreamEntryAndSymbols()
    {
        var text = "Interesting! [DREAM_ENTRY: A vast ocean with glowing fish] [SYMBOLS: ocean, fish, light]";
        var entry = _extractor.TryExtract("dream", text);

        Assert.NotNull(entry);
        Assert.Equal("A vast ocean with glowing fish", entry!.Summary);
        Assert.Equal(["ocean", "fish", "light"], entry.Tags);
        Assert.Equal("dream", entry.Type);
    }

    [Fact]
    public void TryExtract_NoMarkers_ReturnsNull()
    {
        var entry = _extractor.TryExtract("evening", "Just a regular message with no markers.");
        Assert.Null(entry);
    }

    [Fact]
    public void TryExtract_CaseInsensitive_Matches()
    {
        var text = "[entry: lowercase marker test] [moods: happy]";
        var entry = _extractor.TryExtract("evening", text);
        Assert.NotNull(entry);
        Assert.Equal("lowercase marker test", entry!.Summary);
    }

    [Fact]
    public void TryExtract_MissingTagsSection_ReturnsEmptyTags()
    {
        var text = "[ENTRY: A good day with no mood tags]";
        var entry = _extractor.TryExtract("evening", text);
        Assert.NotNull(entry);
        Assert.Empty(entry!.Tags);
    }

    [Fact]
    public void TryExtract_StoresRawTranscript_WhenProvided()
    {
        var text = "[ENTRY: test] [MOODS: calm]";
        var entry = _extractor.TryExtract("evening", text, rawTranscript: "full conversation here");
        Assert.Equal("full conversation here", entry!.RawTranscript);
    }
}
