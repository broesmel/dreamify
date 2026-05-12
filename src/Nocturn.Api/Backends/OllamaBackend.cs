using Microsoft.Extensions.AI;
using Nocturn.Core.Interfaces;
using Nocturn.Core.Models;
using Nocturn.Core.Services;
using OpenAI;
using System.ClientModel;
using System.Runtime.CompilerServices;
using System.Text;

namespace Nocturn.Api.Backends;

public class OllamaBackend(AppSettings appSettings) : IInferenceBackend
{
    public async IAsyncEnumerable<string> CompleteStreamingAsync(
        string mode,
        IList<ChatMessage> history,
        string userMessage,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        history.Add(new ChatMessage(ChatRole.User, userMessage));

        var messages = new List<ChatMessage>
        {
            new(ChatRole.System, DiaryAgentService.GetSystemPrompt(mode))
        };
        messages.AddRange(history);

        // Create client per-request so model/endpoint changes take effect immediately
        var chatClient = new OpenAIClient(
            new ApiKeyCredential("ollama"),
            new OpenAIClientOptions { Endpoint = new Uri(appSettings.OllamaEndpoint) })
            .GetChatClient(appSettings.ModelName)
            .AsIChatClient();

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
