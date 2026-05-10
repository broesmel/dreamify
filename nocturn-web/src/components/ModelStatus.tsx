import { useEffect, useState } from 'react'
import { Badge, Tooltip } from '@mantine/core'
import { getModelHealth } from '../api/client'

export function ModelStatus() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    getModelHealth()
      .then(d => { setStatus('ok'); setModels(d.availableModels) })
      .catch(() => setStatus('error'))
  }, [])

  const color = status === 'ok' ? 'green' : status === 'error' ? 'red' : 'gray'
  const label = status === 'ok' ? models[0] ?? 'Ollama' : status === 'error' ? 'Ollama offline' : '…'

  return (
    <Tooltip label={status === 'ok' ? models.join(', ') : 'Start Ollama to enable AI'} withArrow>
      <Badge color={color} variant="dot" size="sm" style={{ cursor: 'default' }}>
        {label}
      </Badge>
    </Tooltip>
  )
}
