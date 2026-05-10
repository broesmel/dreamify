// Shared API client — same contract as the web client, adapted for React Native fetch

export interface JournalEntry {
  id: string
  sessionId: string
  type: 'evening' | 'dream'
  summary: string
  tags: string[]
  capturedAt: string
}

export interface BackupMeta {
  filename: string
  createdAtUtc: string
  sizeBytes: number
  encrypted: boolean
  entryCount: number
}

export interface BackupSettings {
  autoBackupFrequency: string
  backupFolderPath: string
  maxBackupsToKeep: number
  includeRawTranscripts: boolean
  includeSettings: boolean
  encryptBackups: boolean
  lastAutoBackupUtc: string | null
}

let apiBase = 'http://localhost:5000'

export function setApiBase(url: string) {
  apiBase = url.replace(/\/$/, '')
}

export function getApiBase() {
  return apiBase
}

export async function checkApiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/health/model`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function getModelHealth(): Promise<{ status: string; availableModels: string[] }> {
  const res = await fetch(`${apiBase}/health/model`)
  return res.json()
}

export async function createSession(mode: 'evening' | 'dream'): Promise<string> {
  const res = await fetch(`${apiBase}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  const data = await res.json()
  return data.sessionId
}

export async function* streamChat(
  sessionId: string,
  message: string,
  onEntry: (entryId: string) => void,
): AsyncGenerator<string> {
  const res = await fetch(`${apiBase}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastEventWasEntry = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event: entry')) { lastEventWasEntry = true; continue }
      if (line.startsWith('data: ') && lastEventWasEntry) {
        onEntry(line.slice(6).trim())
        lastEventWasEntry = false
      } else if (line.startsWith('data: ')) {
        yield line.slice(6)
        lastEventWasEntry = false
      }
    }
  }
}

export async function getEntries(type?: 'evening' | 'dream'): Promise<JournalEntry[]> {
  const url = type ? `${apiBase}/entries?type=${type}` : `${apiBase}/entries`
  const res = await fetch(url)
  return res.json()
}

export async function deleteEntry(id: string): Promise<void> {
  await fetch(`${apiBase}/entries/${id}`, { method: 'DELETE' })
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const res = await fetch(`${apiBase}/backup/settings`)
  return res.json()
}

export async function saveBackupSettings(settings: BackupSettings): Promise<void> {
  await fetch(`${apiBase}/backup/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

export async function triggerBackup(): Promise<void> {
  await fetch(`${apiBase}/backup/trigger`, { method: 'POST' })
}

export async function getBackupList(): Promise<BackupMeta[]> {
  const res = await fetch(`${apiBase}/backup/list`)
  return res.json()
}
