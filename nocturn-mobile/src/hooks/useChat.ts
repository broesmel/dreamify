import { useState, useRef, useCallback } from 'react'
import { createSession } from '../api/client'
import { streamInference } from '../inference/InferenceClient'
import type { InferenceMode } from '../inference/InferenceClient'

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface Message {
  role: 'user' | 'assistant'
  text: string
}

export function useChat(diaryMode: 'evening' | 'dream', inferenceMode: InferenceMode) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [entrySaved, setEntrySaved] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const historyRef = useRef<ChatMessage[]>([])

  const reset = useCallback(async () => {
    setMessages([])
    setEntrySaved(false)
    historyRef.current = []
    sessionIdRef.current = await createSession(diaryMode)
  }, [diaryMode])

  const send = useCallback(async (text: string) => {
    if (streaming || !text.trim()) return

    if (!sessionIdRef.current) {
      sessionIdRef.current = await createSession(diaryMode)
    }

    setMessages(m => [...m, { role: 'user', text }])
    setMessages(m => [...m, { role: 'assistant', text: '' }])
    setStreaming(true)

    historyRef.current.push({ role: 'user', content: text })
    let fullResponse = ''

    try {
      for await (const chunk of streamInference(
        inferenceMode,
        diaryMode,
        historyRef.current,
        text,
        sessionIdRef.current,
        (_entryId) => setEntrySaved(true),
      )) {
        fullResponse += chunk
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            text: copy[copy.length - 1].text + chunk,
          }
          return copy
        })
      }
      historyRef.current.push({ role: 'assistant', content: fullResponse })
    } finally {
      setStreaming(false)
    }
  }, [streaming, diaryMode, inferenceMode])

  return { messages, streaming, entrySaved, send, reset }
}
