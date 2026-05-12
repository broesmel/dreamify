import { useEffect, useState } from 'react'
import { Badge, Tooltip } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { getModelHealth } from '../api/client'

export function ModelStatus() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [models, setModels] = useState<string[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])

  function check() {
    getModelHealth()
      .then(d => { setStatus('ok'); setModels(d.availableModels) })
      .catch(() => setStatus('error'))
  }

  const color = status === 'ok' ? 'green' : status === 'error' ? 'red' : 'gray'
  const label = status === 'ok'
    ? (models[0] ?? 'Ollama ready')
    : status === 'error' ? 'Ollama offline — click to fix' : '…'

  return (
    <Tooltip
      label={status === 'ok' ? models.join(', ') : 'Ollama not running. Go to Settings → AI Model to download a model.'}
      withArrow
      multiline
      w={220}
    >
      <Badge
        color={color}
        variant="dot"
        size="sm"
        style={{ cursor: status === 'error' ? 'pointer' : 'default' }}
        onClick={() => status === 'error' && navigate('/settings')}
      >
        {label}
      </Badge>
    </Tooltip>
  )
}
