import { Title, Text, Stack } from '@mantine/core'
import { ChatPanel } from '../components/ChatPanel'

export function EveningPage() {
  return (
    <Stack h="calc(100vh - 2rem)" gap="sm">
      <div>
        <Title order={2} c="violet.3">Evening Reflection</Title>
        <Text size="sm" c="dimmed">Take a moment to close the day.</Text>
      </div>
      <ChatPanel mode="evening" />
    </Stack>
  )
}
