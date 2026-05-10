using Microsoft.Extensions.AI;

namespace Nocturn.Core.Interfaces;

public interface IInferenceBackend
{
    IAsyncEnumerable<string> CompleteStreamingAsync(
        string mode,
        IList<ChatMessage> history,
        string userMessage,
        CancellationToken ct = default);
}
