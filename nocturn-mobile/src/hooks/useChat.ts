import { useState, useRef, useCallback } from 'react'
import { createSession, streamChat } from '../api/client'
import type { InferenceMode } from '../inference/InferenceClient'

export interface Message {
  role: 'user' | 'assistant'
  text: string
}

export function useChat(diaryMode: 'evening' | 'dream', inferenceMode: InferenceMode) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [entrySaved, setEntrySaved] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  const reset = useCallback(async () => {
    setMessages([])
    setEntrySaved(false)
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

    try {
      for await (const chunk of streamChat(
        sessionIdRef.current,
        text,
        (_entryId) => setEntrySaved(true),
      )) {
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            text: copy[copy.length - 1].text + chunk,
          }
          return copy
        })
      }
    } finally {
      setStreaming(false)
    }
  }, [streaming, diaryMode, inferenceMode])

  return { messages, streaming, entrySaved, send, reset }
}
