import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { PaperProvider, MD3DarkTheme, adaptNavigationTheme } from 'react-native-paper'
import { useColorScheme } from 'react-native'
import { RootNavigator } from './src/screens/RootNavigator'

const nocturnTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#9d7fe8',          // violet
    primaryContainer: '#3b2a6b',
    secondary: '#7b9cde',        // indigo accent
    secondaryContainer: '#1e3060',
    background: '#0f0f14',
    surface: '#16161f',
    surfaceVariant: '#222230',
    onSurface: '#e4e4f0',
    onSurfaceVariant: '#a0a0c0',
    onSurfaceDisabled: '#505068',
  },
}

export default function App() {
  return (
    <PaperProvider theme={nocturnTheme}>
      <StatusBar style="light" />
      <RootNavigator />
    </PaperProvider>
  )
}
