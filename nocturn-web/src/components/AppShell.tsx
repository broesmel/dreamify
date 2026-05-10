import { AppShell, Text, NavLink, Stack } from '@mantine/core'
import { IconMoon, IconBook, IconSettings, IconFeather } from '@tabler/icons-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ModelStatus } from './ModelStatus'

const nav = [
  { path: '/', label: 'Evening', icon: IconMoon },
  { path: '/dream', label: 'Dream', icon: IconFeather },
  { path: '/journal', label: 'Journal', icon: IconBook },
  { path: '/settings', label: 'Settings', icon: IconSettings },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <AppShell navbar={{ width: 200, breakpoint: 'sm' }} padding="md">
      <AppShell.Navbar p="md">
        <Stack justify="space-between" h="100%">
          <Stack gap={4}>
            <Text fw={700} size="lg" mb="md" c="violet.3">Nocturn</Text>
            {nav.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                label={label}
                leftSection={<Icon size={16} />}
                active={location.pathname === path}
                onClick={() => navigate(path)}
              />
            ))}
          </Stack>
          <ModelStatus />
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}
