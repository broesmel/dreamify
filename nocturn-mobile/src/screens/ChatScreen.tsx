import React, { useEffect, useRef, useState } from 'react'
import {
  View, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, TouchableOpacity, ActivityIndicator
} from 'react-native'
import { Text, TextInput, Snackbar, useTheme } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useChat } from '../hooks/useChat'
import type { InferenceMode } from '../inference/InferenceClient'

interface Props {
  mode: 'evening' | 'dream'
  inferenceMode: InferenceMode
}

export function ChatScreen({ mode, inferenceMode }: Props) {
  const theme = useTheme()
  const { messages, streaming, entrySaved, send, reset } = useChat(mode, inferenceMode)
  const [input, setInput] = useState('')
  const [snack, setSnack] = useState(false)
  const listRef = useRef<FlatList>(null)

  useEffect(() => { reset() }, [mode])

  useEffect(() => {
    if (entrySaved) setSnack(true)
  }, [entrySaved])

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    await send(text)
  }

  const placeholder = mode === 'evening' ? 'How was your day?' : 'Tell me about your dream…'

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {messages.length === 0 && (
        <View style={styles.emptyState}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceDisabled, fontStyle: 'italic' }}>
            {placeholder}
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[
            styles.bubble,
            item.role === 'user'
              ? [styles.userBubble, { backgroundColor: theme.colors.primaryContainer }]
              : [styles.assistantBubble, { backgroundColor: theme.colors.surfaceVariant }],
          ]}>
            <Text
              variant="bodyMedium"
              style={{ color: item.role === 'user' ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}
            >
              {item.text}
              {streaming && item.role === 'assistant' && item === messages[messages.length - 1]
                ? <Text style={{ color: theme.colors.onSurfaceDisabled }}> ▋</Text>
                : null}
            </Text>
          </View>
        )}
      />

      <View style={[styles.inputRow, { borderTopColor: theme.colors.surfaceVariant }]}>
        <TextInput
          mode="outlined"
          value={input}
          onChangeText={setInput}
          placeholder="Write here…"
          multiline
          style={styles.input}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          disabled={streaming}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={streaming || !input.trim()}
          style={[styles.sendBtn, { backgroundColor: theme.colors.primary }]}
        >
          {streaming
            ? <ActivityIndicator color={theme.colors.onPrimary} size="small" />
            : <MaterialCommunityIcons name="send" size={20} color={theme.colors.onPrimary} />}
        </TouchableOpacity>
      </View>

      <Snackbar
        visible={snack}
        onDismiss={() => setSnack(false)}
        duration={3000}
        style={{ backgroundColor: theme.colors.primaryContainer }}
      >
        <Text style={{ color: theme.colors.onPrimaryContainer }}>
          {mode === 'evening' ? '✦ Evening entry saved' : '✦ Dream captured'}
        </Text>
      </Snackbar>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: { position: 'absolute', top: '40%', alignSelf: 'center', zIndex: 0 },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  input: { flex: 1, maxHeight: 120 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
})
