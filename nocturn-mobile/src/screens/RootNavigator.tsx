import React from 'react'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from 'react-native-paper'
import { ChatScreen } from './ChatScreen'
import { JournalScreen } from './JournalScreen'
import { SettingsScreen } from './SettingsScreen'
import { useSettings } from '../hooks/useSettings'

const Tab = createBottomTabNavigator()

export function RootNavigator() {
  const theme = useTheme()
  const { settings } = useSettings()

  const navTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.surfaceVariant,
    },
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceDisabled,
          tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.surfaceVariant },
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
        }}
      >
        <Tab.Screen
          name="Evening"
          options={{
            title: 'Evening',
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="moon-waning-crescent" size={size} color={color} />,
          }}
        >
          {() => <ChatScreen mode="evening" inferenceMode={settings.inference.mode} />}
        </Tab.Screen>

        <Tab.Screen
          name="Dream"
          options={{
            title: 'Dream',
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="feather" size={size} color={color} />,
          }}
        >
          {() => <ChatScreen mode="dream" inferenceMode={settings.inference.mode} />}
        </Tab.Screen>

        <Tab.Screen
          name="Journal"
          component={JournalScreen}
          options={{
            title: 'Journal',
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />,
          }}
        />

        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cog-outline" size={size} color={color} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
