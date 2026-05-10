using Microsoft.Extensions.AI;
using Nocturn.Core.Interfaces;
using Nocturn.Core.Services;
using System.Runtime.CompilerServices;
using System.Text;

namespace Nocturn.Api.Backends;

public class OllamaBackend(IChatClient chatClient) : IInferenceBackend
{
    public async IAsyncEnumerable<string> CompleteStreamingAsync(
        string mode,
        IList<ChatMessage> history,
        string userMessage,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        history.Add(new ChatMessage(ChatRole.User, userMessage));

        // Build full message list: system prompt first, then conversation history
        var messages = new List<ChatMessage>
        {
            new(ChatRole.System, DiaryAgentService.GetSystemPrompt(mode))
        };
        messages.AddRange(history);

        var fullResponse = new StringBuilder();

        await foreach (var update in chatClient.GetStreamingResponseAsync(messages, null, ct))
        {
            var text = update.ToString();
            fullResponse.Append(text);
            yield return text;
        }

        history.Add(new ChatMessage(ChatRole.Assistant, fullResponse.ToString()));
    }
}
