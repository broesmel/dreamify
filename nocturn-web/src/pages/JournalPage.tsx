import { useEffect, useState } from 'react'
import { Title, Text, Stack, Card, Badge, Group, ActionIcon, SegmentedControl, Loader, Center } from '@mantine/core'
import { IconTrash, IconMoon, IconFeather } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { getEntries, deleteEntry } from '../api/client'
import type { JournalEntry } from '../api/client'

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'evening' | 'dream'>('all')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const type = filter === 'all' ? undefined : filter
    setEntries(await getEntries(type))
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function remove(id: string) {
    await deleteEntry(id)
    notifications.show({ title: 'Deleted', message: 'Entry removed.', color: 'gray' })
    load()
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={2} c="violet.3">Journal</Title>
        <Text size="sm" c="dimmed">Your captured moments.</Text>
      </div>

      <SegmentedControl
        value={filter}
        onChange={v => setFilter(v as typeof filter)}
        data={[
          { label: 'All', value: 'all' },
          { label: 'Evening', value: 'evening' },
          { label: 'Dreams', value: 'dream' },
        ]}
        w={280}
      />

      {loading ? (
        <Center mt="xl"><Loader color="violet" /></Center>
      ) : entries.length === 0 ? (
        <Text c="dimmed" ta="center" mt="xl" fs="italic">No entries yet.</Text>
      ) : (
        <Stack gap="sm">
          {entries.map(entry => (
            <Card key={entry.id} bg="dark.7" radius="md" padding="md">
              <Group justify="space-between" mb={6}>
                <Group gap="xs">
                  {entry.type === 'evening'
                    ? <IconMoon size={14} color="var(--mantine-color-violet-4)" />
                    : <IconFeather size={14} color="var(--mantine-color-indigo-4)" />}
                  <Text size="xs" c="dimmed">
                    {new Date(entry.capturedAt).toLocaleDateString(undefined, {
                      weekday: 'long', month: 'long', day: 'numeric'
                    })}
                  </Text>
                </Group>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => remove(entry.id)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>

              <Text size="sm" mb="xs">{entry.summary}</Text>

              <Group gap={4}>
                {entry.tags.map(tag => (
                  <Badge key={tag} size="xs" variant="light" color={entry.type === 'evening' ? 'violet' : 'indigo'}>
                    {tag}
                  </Badge>
                ))}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
