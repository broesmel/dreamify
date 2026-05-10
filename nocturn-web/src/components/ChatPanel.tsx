import { useEffect, useRef, useState } from 'react'
import { Stack, Paper, Text, Textarea, ActionIcon, Group, Loader, Box } from '@mantine/core'
import { IconSend } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { createSession, streamChat } from '../api/client'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  mode: 'evening' | 'dream'
  onEntrySaved?: () => void
}

export function ChatPanel({ mode, onEntrySaved }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createSession(mode).then(setSessionId)
    setMessages([])
  }, [mode])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!sessionId || !input.trim() || streaming) return
    const text = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])
    setStreaming(true)

    setMessages(m => [...m, { role: 'assistant', text: '' }])

    try {
      for await (const chunk of streamChat(sessionId, text, (_entryId) => {
        notifications.show({
          title: 'Entry saved',
          message: `Your ${mode} entry was captured.`,
          color: 'violet',
        })
        onEntrySaved?.()
      })) {
        setMessages(m => {
          const updated = [...m]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            text: updated[updated.length - 1].text + chunk,
          }
          return updated
        })
      }
    } catch {
      notifications.show({ title: 'Error', message: 'Could not reach the API.', color: 'red' })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <Stack h="100%" gap="md">
      <Stack flex={1} gap="xs" style={{ overflowY: 'auto', minHeight: 0 }}>
        {messages.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl" fs="italic">
            {mode === 'evening'
              ? 'How was your day?'
              : 'Tell me about your dream…'}
          </Text>
        )}
        {messages.map((msg, i) => (
          <Box key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <Paper
              p="sm"
              radius="md"
              maw="75%"
              bg={msg.role === 'user' ? 'violet.9' : 'dark.6'}
            >
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {msg.text}
                {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                  <Text span c="dimmed"> ▋</Text>
                )}
              </Text>
            </Paper>
          </Box>
        ))}
        <div ref={bottomRef} />
      </Stack>

      <Group gap="xs" align="flex-end">
        <Textarea
          flex={1}
          placeholder="Write here…"
          value={input}
          onChange={e => setInput(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          autosize
          minRows={1}
          maxRows={5}
          disabled={streaming}
        />
        <ActionIcon size="lg" variant="filled" color="violet" onClick={send} disabled={streaming || !input.trim()}>
          {streaming ? <Loader size="xs" color="white" /> : <IconSend size={16} />}
        </ActionIcon>
      </Group>
    </Stack>
  )
}
