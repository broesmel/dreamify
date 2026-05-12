import { useEffect, useState } from 'react'
import {
  Stack, Text, Card, Group, Badge, Button, Progress,
  ActionIcon, Tooltip, Alert, Loader, Center,
} from '@mantine/core'
import { IconDownload, IconTrash, IconCheck, IconAlertCircle, IconCpu } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import {
  getAvailableModels, getInstalledModels, pullModel,
  deleteModel, setActiveModel, getModelHealth,
} from '../api/client'
import type { AvailableModel } from '../api/client'

export function ModelManager() {
  const [catalog, setCatalog] = useState<AvailableModel[]>([])
  const [installed, setInstalled] = useState<string[]>([])
  const [activeModel, setActive] = useState<string>('')
  const [pulling, setPulling] = useState<Record<string, number>>({})  // name → progress %
  const [loading, setLoading] = useState(true)
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cat, inst, health] = await Promise.all([
        getAvailableModels(),
        getInstalledModels(),
        getModelHealth().catch(() => null),
      ])
      setCatalog(cat)
      setInstalled(inst)
      setOllamaUp(health !== null && health.status === 'ok')
      if (health?.availableModels?.length) setActive(health.availableModels[0])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handlePull(name: string) {
    setPulling(p => ({ ...p, [name]: 0 }))
    try {
      for await (const update of pullModel(name)) {
        if (update.total && update.completed) {
          setPulling(p => ({ ...p, [name]: Math.round((update.completed! / update.total!) * 100) }))
        }
        if (update.status === 'success') {
          setInstalled(i => [...new Set([...i, name])])
          notifications.show({ title: 'Download complete', message: `${name} is ready.`, color: 'violet' })
          await handleSetActive(name)
        }
      }
    } catch {
      notifications.show({ title: 'Download failed', message: name, color: 'red' })
    } finally {
      setPulling(p => { const next = { ...p }; delete next[name]; return next })
      load()
    }
  }

  async function handleDelete(name: string) {
    await deleteModel(name)
    setInstalled(i => i.filter(x => x !== name))
    notifications.show({ message: `${name} removed.`, color: 'gray' })
  }

  async function handleSetActive(name: string) {
    await setActiveModel(name)
    setActive(name)
    notifications.show({ title: 'Model switched', message: name, color: 'violet' })
  }

  if (loading) return <Center py="md"><Loader color="violet" size="sm" /></Center>

  return (
    <Stack gap="sm">
      {ollamaUp === false && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Ollama not running">
          Start Ollama first: open the Ollama app or run <code>ollama serve</code> in a terminal.
        </Alert>
      )}

      <Text size="xs" c="dimmed">
        Choose a model that fits your device. Larger models produce richer diary entries but need more RAM.
      </Text>

      {catalog.map(model => {
        const isInstalled = installed.some(i => i.startsWith(model.name.split(':')[0]))
        const isActive = activeModel.startsWith(model.name.split(':')[0])
        const progress = pulling[model.name]
        const isPulling = progress !== undefined

        return (
          <Card key={model.name} bg="dark.7" radius="md" padding="sm"
            style={{ border: isActive ? '1px solid var(--mantine-color-violet-6)' : '1px solid transparent' }}>
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} size="sm">{model.label}</Text>
                  {model.recommended && <Badge size="xs" color="violet">Recommended</Badge>}
                  {isActive && <Badge size="xs" color="green" leftSection={<IconCheck size={10} />}>Active</Badge>}
                </Group>
                <Text size="xs" c="dimmed">{model.description}</Text>
                <Group gap="xs">
                  <IconCpu size={12} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed">{model.ramGb} GB RAM · {model.bestFor}</Text>
                </Group>
                {isPulling && (
                  <Progress value={progress} color="violet" size="xs" mt={4} animated />
                )}
              </Stack>

              <Group gap="xs" wrap="nowrap">
                {!isInstalled && !isPulling && (
                  <Tooltip label="Download" withArrow>
                    <Button
                      size="xs"
                      variant="light"
                      color="violet"
                      leftSection={<IconDownload size={12} />}
                      onClick={() => handlePull(model.name)}
                      disabled={ollamaUp === false}
                    >
                      Get
                    </Button>
                  </Tooltip>
                )}
                {isPulling && (
                  <Text size="xs" c="dimmed">{progress}%</Text>
                )}
                {isInstalled && !isActive && (
                  <Button size="xs" variant="subtle" color="violet" onClick={() => handleSetActive(model.name)}>
                    Use
                  </Button>
                )}
                {isInstalled && (
                  <Tooltip label="Remove" withArrow>
                    <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => handleDelete(model.name)}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
          </Card>
        )
      })}
    </Stack>
  )
}
