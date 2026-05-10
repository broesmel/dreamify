import React, { useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet, Alert } from 'react-native'
import {
  Text, TextInput, Switch, Button, Divider, List,
  useTheme, ActivityIndicator, SegmentedButtons, Badge,
} from 'react-native-paper'
import * as DocumentPicker from 'expo-document-picker'
import { File as FSFile, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useSettings } from '../hooks/useSettings'
import { checkApiReachable, getBackupSettings, saveBackupSettings, triggerBackup, getApiBase } from '../api/client'
import { isLocalModelLoaded, loadLocalModel } from '../inference/InferenceClient'

export function SettingsScreen() {
  const theme = useTheme()
  const { settings, save, loaded } = useSettings()
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  useEffect(() => {
    if (!loaded) return
    checkApiReachable().then(setApiReachable)
    setModelLoaded(isLocalModelLoaded())
  }, [loaded])

  async function pickModel() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' })
    if (result.canceled) return
    const uri = result.assets[0].uri
    Alert.alert('Load model?', `This will load ${result.assets[0].name} into memory (~1–2 min).`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Load', onPress: async () => {
          await loadLocalModel(uri, settings.inference.contextSize)
          setModelLoaded(isLocalModelLoaded())
          await save({ inference: { ...settings.inference, localModelPath: uri } })
        }
      },
    ])
  }

  async function handleBackupNow() {
    setBackingUp(true)
    try {
      // Export from API, save to device Downloads
      const res = await fetch(`${getApiBase()}/backup/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeTranscripts: false, includeSettings: true }),
      })
      const blob = await res.blob()
      const filename = `nocturn-backup-${Date.now()}.nocturn-backup`
      const file = new FSFile(Paths.document, filename)
      const buffer = await blob.arrayBuffer()
      file.write(new Uint8Array(buffer))
      await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream' })
    } finally {
      setBackingUp(false)
    }
  }

  async function handleImport() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' })
    if (result.canceled) return
    const asset = result.assets[0]
    const form = new FormData()
    form.append('file', { uri: asset.uri, name: asset.name, type: 'application/octet-stream' } as any)
    const res = await fetch(`${getApiBase()}/backup/import`, { method: 'POST', body: form })
    const data: any = await res.json()
    Alert.alert(
      data.success ? 'Restored' : 'Failed',
      data.success ? `${data.entriesImported} entries imported.` : data.error,
    )
  }

  if (!loaded) {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>

      {/* Connection */}
      <List.Section>
        <List.Subheader>API Connection</List.Subheader>
        <TextInput
          mode="outlined"
          label="API base URL"
          value={settings.apiBase}
          onChangeText={v => save({ apiBase: v })}
          onBlur={() => checkApiReachable().then(setApiReachable)}
          autoCapitalize="none"
          keyboardType="url"
          style={styles.input}
          right={
            <TextInput.Icon
              icon={apiReachable === null ? 'circle-outline' : apiReachable ? 'check-circle' : 'alert-circle'}
              color={apiReachable === null ? theme.colors.onSurfaceDisabled : apiReachable ? 'green' : theme.colors.error}
            />
          }
        />
        <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceDisabled }]}>
          Set this to your desktop's local IP, e.g. http://192.168.1.50:5000
        </Text>
      </List.Section>

      <Divider />

      {/* Inference */}
      <List.Section>
        <List.Subheader>Inference Mode</List.Subheader>
        <SegmentedButtons
          value={settings.inference.mode}
          onValueChange={v => save({ inference: { ...settings.inference, mode: v as any } })}
          buttons={[
            { value: 'network', label: 'Network (Ollama)' },
            { value: 'local', label: 'Local (llama.rn)' },
          ]}
          style={styles.segments}
        />
        {settings.inference.mode === 'local' && (
          <View style={styles.localModelRow}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
              {settings.inference.localModelPath || 'No model loaded'}
            </Text>
            <Badge style={{ backgroundColor: modelLoaded ? 'green' : theme.colors.error }}>
              {modelLoaded ? 'Ready' : 'Not loaded'}
            </Badge>
            <Button mode="outlined" onPress={pickModel} compact style={styles.pickBtn}>
              {modelLoaded ? 'Change' : 'Load .gguf'}
            </Button>
          </View>
        )}
        <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceDisabled }]}>
          {settings.inference.mode === 'local'
            ? 'Runs fully offline. Requires a Q4_K_M quantized GGUF file (~1.8 GB).'
            : 'Streams from your desktop Ollama. Requires LAN connection.'}
        </Text>
      </List.Section>

      <Divider />

      {/* Backup */}
      <List.Section>
        <List.Subheader>Backup</List.Subheader>
        <View style={styles.row}>
          <Text variant="bodyMedium">Auto-backup when app closes</Text>
          <Switch
            value={settings.autoBackupOnBackground}
            onValueChange={v => save({ autoBackupOnBackground: v })}
          />
        </View>
        <View style={[styles.row, styles.buttonRow]}>
          <Button
            mode="contained-tonal"
            icon="download"
            onPress={handleBackupNow}
            loading={backingUp}
            disabled={apiReachable === false}
          >
            Export backup
          </Button>
          <Button
            mode="outlined"
            icon="upload"
            onPress={handleImport}
            disabled={apiReachable === false}
          >
            Import
          </Button>
        </View>
        {apiReachable === false && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginHorizontal: 16, marginTop: 4 }}>
            API not reachable — connect to your desktop's network first.
          </Text>
        )}
      </List.Section>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },
  input: { marginHorizontal: 16, marginVertical: 8 },
  hint: { marginHorizontal: 16, marginBottom: 8 },
  segments: { marginHorizontal: 16, marginVertical: 8 },
  localModelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 8 },
  pickBtn: { flexShrink: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  buttonRow: { gap: 8, justifyContent: 'flex-start' },
})
