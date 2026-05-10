const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

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
  formatVersion: number
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

// --- Sessions ---

export async function createSession(mode: 'evening' | 'dream'): Promise<string> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  const data = await res.json()
  return data.sessionId
}

// Returns an async generator that yields text chunks and fires onEntry when an entry is saved
export async function* streamChat(
  sessionId: string,
  message: string,
  onEntry: (entryId: string) => void,
): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event: entry')) continue
      if (line.startsWith('data: ') && buffer.includes('event: entry')) {
        onEntry(line.slice(6).trim())
      } else if (line.startsWith('data: ')) {
        yield line.slice(6)
      }
    }
  }
}

// --- Journal Entries ---

export async function getEntries(type?: 'evening' | 'dream'): Promise<JournalEntry[]> {
  const url = type ? `${BASE}/entries?type=${type}` : `${BASE}/entries`
  const res = await fetch(url)
  return res.json()
}

export async function deleteEntry(id: string): Promise<void> {
  await fetch(`${BASE}/entries/${id}`, { method: 'DELETE' })
}

// --- Backup ---

export async function getBackupList(): Promise<BackupMeta[]> {
  const res = await fetch(`${BASE}/backup/list`)
  return res.json()
}

export async function exportBackup(passphrase?: string): Promise<void> {
  const res = await fetch(`${BASE}/backup/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase: passphrase ?? null, includeTranscripts: false, includeSettings: true }),
  })
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? 'nocturn-backup.nocturn-backup'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File, passphrase?: string, overwrite = false): Promise<unknown> {
  const form = new FormData()
  form.append('file', file)
  const url = `${BASE}/backup/import?overwrite=${overwrite}${passphrase ? `&passphrase=${encodeURIComponent(passphrase)}` : ''}`
  const res = await fetch(url, { method: 'POST', body: form })
  return res.json()
}

export async function triggerBackup(): Promise<void> {
  await fetch(`${BASE}/backup/trigger`, { method: 'POST' })
}

export async function deleteBackup(filename: string): Promise<void> {
  await fetch(`${BASE}/backup/${encodeURIComponent(filename)}`, { method: 'DELETE' })
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const res = await fetch(`${BASE}/backup/settings`)
  return res.json()
}

export async function saveBackupSettings(settings: BackupSettings): Promise<void> {
  await fetch(`${BASE}/backup/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

// --- Health ---

export async function getModelHealth(): Promise<{ status: string; availableModels: string[] }> {
  const res = await fetch(`${BASE}/health/model`)
  return res.json()
}
