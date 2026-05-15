import { useEffect, useState } from 'react'
import { Title, Text, Stack, Select, NumberInput, Switch, TextInput, Button, Group, Card, ActionIcon, Badge, Loader, Center, FileButton, Divider } from '@mantine/core'
import { IconDownload, IconUpload, IconTrash, IconRefresh } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import {
  getBackupSettings, saveBackupSettings, getBackupList,
  exportBackup, importBackup, deleteBackup, triggerBackup,
} from '../api/client'
import type { BackupSettings, BackupMeta } from '../api/client'
import { ModelManager } from '../components/ModelManager'

export function SettingsPage() {
  const [settings, setSettings] = useState<BackupSettings | null>(null)
  const [backups, setBackups] = useState<BackupMeta[]>([])
  const [saving, setSaving] = useState(false)
  const [triggering, setTriggering] = useState(false)

  async function loadAll() {
    const [s, b] = await Promise.all([getBackupSettings(), getBackupList()])
    setSettings(s)
    setBackups(b)
  }

  useEffect(() => { loadAll() }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    await saveBackupSettings(settings)
    notifications.show({ title: 'Saved', message: 'Backup settings updated.', color: 'green' })
    setSaving(false)
  }

  async function handleExport() {
    await exportBackup()
    notifications.show({ title: 'Exported', message: 'Backup file downloaded.', color: 'violet' })
    loadAll()
  }

  async function handleImport(file: File | null) {
    if (!file) return
    const result = await importBackup(file) as any
    if (result.success) {
      notifications.show({
        title: 'Imported',
        message: `${result.entriesImported} entries restored.`,
        color: 'green',
      })
    } else {
      notifications.show({ title: 'Import failed', message: result.error, color: 'red' })
    }
  }

  async function handleTrigger() {
    setTriggering(true)
    await triggerBackup()
    notifications.show({ title: 'Backup complete', message: 'Saved to backup folder.', color: 'violet' })
    await loadAll()
    setTriggering(false)
  }

  async function handleDelete(filename: string) {
    await deleteBackup(filename)
    setBackups(b => b.filter(x => x.filename !== filename))
  }

  if (!settings) return <Center mt="xl"><Loader color="violet" /></Center>

  const lastBackup = settings.lastAutoBackupUtc
    ? new Date(settings.lastAutoBackupUtc).toLocaleString()
    : 'Never'

  return (
    <Stack gap="lg" maw={560}>
      <div>
        <Title order={2} c="violet.3">Settings</Title>
        <Text size="sm" c="dimmed">Model, backup & data management.</Text>
      </div>

      <Card bg="dark.7" radius="md" padding="lg">
        <Stack gap="md">
          <Text fw={600}>AI Model</Text>
          <ModelManager />
        </Stack>
      </Card>

      <Divider />

      <Card bg="dark.7" radius="md" padding="lg">
        <Stack gap="md">
          <Text fw={600}>Auto-Backup</Text>

          <Select
            label="Frequency"
            value={settings.autoBackupFrequency}
            onChange={v => setSettings(s => s ? { ...s, autoBackupFrequency: v! } : s)}
            data={[
              { label: 'Off', value: 'off' },
              { label: 'On Exit', value: 'on-exit' },
              { label: 'Daily', value: 'daily' },
              { label: 'Weekly', value: 'weekly' },
            ]}
          />

          <TextInput
            label="Backup folder"
            description="Point this at an OneDrive, iCloud, or Dropbox folder for cloud backup."
            value={settings.backupFolderPath}
            onChange={e => setSettings(s => s ? { ...s, backupFolderPath: e.target.value } : s)}
          />

          <NumberInput
            label="Keep last N backups"
            value={settings.maxBackupsToKeep}
            onChange={v => setSettings(s => s ? { ...s, maxBackupsToKeep: Number(v) } : s)}
            min={1}
            max={50}
          />

          <Switch
            label="Include raw transcripts"
            description="Full AI conversation history — makes backups larger."
            checked={settings.includeRawTranscripts}
            onChange={e => setSettings(s => s ? { ...s, includeRawTranscripts: e.currentTarget.checked } : s)}
          />

          <Switch
            label="Encrypt backups"
            description="Backups are encrypted with AES-256-GCM using the passphrase below."
            checked={settings.encryptBackups}
            onChange={e => setSettings(s => s ? { ...s, encryptBackups: e.currentTarget.checked } : s)}
          />

          {settings.encryptBackups && (
            <TextInput
              label="Backup passphrase"
              description="Required for auto-backup encryption. Store this safely — you'll need it to restore."
              type="password"
              value={settings.backupPassphrase ?? ''}
              onChange={e => setSettings(s => s ? { ...s, backupPassphrase: e.target.value || null } : s)}
            />
          )}

          <Text size="xs" c="dimmed">Last auto-backup: {lastBackup}</Text>

          <Group>
            <Button variant="filled" color="violet" onClick={save} loading={saving}>Save settings</Button>
            <Button variant="subtle" leftSection={<IconRefresh size={14} />} onClick={handleTrigger} loading={triggering}>
              Backup now
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card bg="dark.7" radius="md" padding="lg">
        <Stack gap="md">
          <Text fw={600}>Export & Import</Text>

          <Group>
            <Button leftSection={<IconDownload size={14} />} variant="light" color="violet" onClick={handleExport}>
              Export backup
            </Button>
            <FileButton onChange={handleImport} accept=".nocturn-backup">
              {props => (
                <Button {...props} leftSection={<IconUpload size={14} />} variant="light" color="gray">
                  Import backup
                </Button>
              )}
            </FileButton>
          </Group>
        </Stack>
      </Card>

      {backups.length > 0 && (
        <Card bg="dark.7" radius="md" padding="lg">
          <Stack gap="sm">
            <Text fw={600}>Backup history</Text>
            {backups.map(b => (
              <Group key={b.filename} justify="space-between">
                <Stack gap={2}>
                  <Text size="sm">{new Date(b.createdAtUtc).toLocaleString()}</Text>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">{b.entryCount} entries</Text>
                    <Text size="xs" c="dimmed">·</Text>
                    <Text size="xs" c="dimmed">{(b.sizeBytes / 1024).toFixed(1)} KB</Text>
                    {b.encrypted && <Badge size="xs" color="yellow">encrypted</Badge>}
                  </Group>
                </Stack>
                <ActionIcon variant="subtle" color="gray" onClick={() => handleDelete(b.filename)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
