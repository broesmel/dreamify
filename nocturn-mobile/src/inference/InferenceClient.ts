/**
 * Abstraction over two inference modes:
 *
 *  "network"  — streams from Nocturn.Api (which calls Ollama).
 *               Works whenever the device is on the same LAN as the desktop.
 *
 *  "local"    — runs llama.rn (llama.cpp) on-device with a GGUF model file.
 *               Fully offline; requires a downloaded model (~1-2 GB).
 *
 * The app selects the mode at startup based on persisted settings, then
 * transparently hands chunks back to the caller as an AsyncGenerator.
 */

import { streamChat, createSession } from '../api/client'

export type InferenceMode = 'network' | 'local'

export interface InferenceSettings {
  mode: InferenceMode
  localModelPath: string  // path to .gguf file for local mode
  contextSize: number     // tokens; 2048 is fine for diary use
}

export const DEFAULT_INFERENCE_SETTINGS: InferenceSettings = {
  mode: 'network',
  localModelPath: '',
  contextSize: 2048,
}

// ── Local mode (llama.rn) ─────────────────────────────────────────────────────

// llama.rn is a native module — import lazily so the app doesn't crash on
// simulators / web previews where the native binary isn't present.
let llamaContext: unknown = null

export async function loadLocalModel(modelPath: string, contextSize = 2048): Promise<void> {
  try {
    const { initLlama } = await import('llama.rn')
    llamaContext = await initLlama({ model: modelPath, n_ctx: contextSize, n_gpu_layers: 99 })
  } catch (e) {
    console.warn('llama.rn not available or model failed to load:', e)
    llamaContext = null
  }
}

export function isLocalModelLoaded(): boolean {
  return llamaContext !== null
}

const SYSTEM_PROMPTS: Record<string, string> = {
  evening: `You are Nocturn, a gentle evening journal companion. Guide the user through
meaningful end-of-day reflection. Ask warm open-ended questions about their day —
what moved them, challenged them, surprised them. After 3-5 exchanges, when you
have enough to summarize, end your message with:
[ENTRY: one sentence summary of their day]
[MOODS: comma, separated, mood, words]
Keep responses to 2-4 sentences. Be warm and poetic, not clinical.`,

  dream: `You are Nocturn, a dream archivist. Help capture dream fragments before they fade.
Ask gentle questions about images, feelings, colors, people. After capturing enough
detail, end your message with:
[DREAM_ENTRY: one evocative sentence describing the dream]
[SYMBOLS: comma, separated, dream, symbols]
Keep responses brief and wonder-filled. Dreams are fragile — handle with care.`,
}

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

async function* streamLocal(
  mode: string,
  history: ChatMessage[],
  userMessage: string,
): AsyncGenerator<string> {
  if (!llamaContext) throw new Error('No model loaded')
  const { LlamaContext } = await import('llama.rn')

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.evening },
    ...history,
    { role: 'user', content: userMessage },
  ]

  const ctx = llamaContext as InstanceType<typeof LlamaContext>
  const tokens: string[] = []
  await ctx.completion(
    { messages, temperature: 0.8, stop: ['</s>', '<|end|>'] },
    (data: { token: string }) => { tokens.push(data.token) },
  )
  // yield the full response as one chunk (llama.rn streams via callback above)
  yield tokens.join('')
}

// ── Network mode ──────────────────────────────────────────────────────────────

export async function* streamInference(
  mode: InferenceMode,
  diaryMode: 'evening' | 'dream',
  history: ChatMessage[],
  userMessage: string,
  networkSessionId: string,
  onEntry: (id: string) => void,
): AsyncGenerator<string> {
  if (mode === 'local') {
    yield* streamLocal(diaryMode, history, userMessage)
  } else {
    yield* streamChat(networkSessionId, userMessage, onEntry)
  }
}
