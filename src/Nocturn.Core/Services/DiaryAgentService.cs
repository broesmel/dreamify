using Microsoft.Extensions.AI;
using Nocturn.Core.Interfaces;

namespace Nocturn.Core.Services;

public class DiaryAgentService(IInferenceBackend backend)
{
    private static readonly Dictionary<string, string> SystemPrompts = new()
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

    public static string GetSystemPrompt(string mode) =>
        SystemPrompts.GetValueOrDefault(mode, SystemPrompts["evening"]);

    public IAsyncEnumerable<string> ChatAsync(
        string mode,
        List<ChatMessage> history,
        string userMessage,
        CancellationToken ct = default)
        => backend.CompleteStreamingAsync(mode, history, userMessage, ct);
}
