import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setApiBase } from '../api/client'
import { DEFAULT_INFERENCE_SETTINGS } from '../inference/InferenceClient'
import type { InferenceSettings } from '../inference/InferenceClient'

export interface AppSettings {
  apiBase: string
  inference: InferenceSettings
  autoBackupOnBackground: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  apiBase: 'http://192.168.1.100:5000',  // user sets this to their desktop IP
  inference: DEFAULT_INFERENCE_SETTINGS,
  autoBackupOnBackground: true,
}

const KEY = 'nocturn_settings'

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) {
        try {
          const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
          setSettingsState(parsed)
          setApiBase(parsed.apiBase)
        } catch { /* use defaults */ }
      }
      setLoaded(true)
    })
  }, [])

  const save = useCallback(async (updated: Partial<AppSettings>) => {
    const next = { ...settings, ...updated }
    setSettingsState(next)
    setApiBase(next.apiBase)
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
  }, [settings])

  return { settings, save, loaded }
}
