import React, { useCallback, useState } from 'react'
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { Text, Chip, Card, IconButton, useTheme, SegmentedButtons, ActivityIndicator } from 'react-native-paper'
import { useFocusEffect } from '@react-navigation/native'
import { getEntries, deleteEntry } from '../api/client'
import type { JournalEntry } from '../api/client'

export function JournalScreen() {
  const theme = useTheme()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'evening' | 'dream'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const type = filter === 'all' ? undefined : filter
      setEntries(await getEntries(type))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filter])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function remove(id: string) {
    await deleteEntry(id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        value={filter}
        onValueChange={v => setFilter(v as typeof filter)}
        buttons={[
          { value: 'all', label: 'All' },
          { value: 'evening', label: 'Evening' },
          { value: 'dream', label: 'Dreams' },
        ]}
        style={styles.segments}
      />

      {entries.length === 0 ? (
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceDisabled, fontStyle: 'italic' }}>
            No entries yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => (
            <Card mode="contained" style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.type === 'evening' ? '🌙' : '✦'}{' '}
                    {new Date(item.capturedAt).toLocaleDateString(undefined, {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })}
                  </Text>
                  <IconButton
                    icon="delete-outline"
                    size={16}
                    onPress={() => remove(item.id)}
                    iconColor={theme.colors.onSurfaceDisabled}
                  />
                </View>
                <Text variant="bodyMedium" style={styles.summary}>{item.summary}</Text>
                <View style={styles.tags}>
                  {item.tags.map(tag => (
                    <Chip
                      key={tag}
                      compact
                      style={{ backgroundColor: item.type === 'evening'
                        ? theme.colors.primaryContainer
                        : theme.colors.secondaryContainer }}
                      textStyle={{ fontSize: 11 }}
                    >
                      {tag}
                    </Chip>
                  ))}
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segments: { margin: 12 },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  summary: { marginBottom: 8, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
