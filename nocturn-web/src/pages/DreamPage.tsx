import { Title, Text, Stack } from '@mantine/core'
import { ChatPanel } from '../components/ChatPanel'

export function DreamPage() {
  return (
    <Stack h="calc(100vh - 2rem)" gap="sm">
      <div>
        <Title order={2} c="violet.3">Dream Archive</Title>
        <Text size="sm" c="dimmed">Capture what fades fastest.</Text>
      </div>
      <ChatPanel mode="dream" />
    </Stack>
  )
}
