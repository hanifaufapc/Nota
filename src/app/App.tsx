import { useState } from 'react';
import { AppShell, type ActiveRoute } from '../components/layout/AppShell';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

export function App() {
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('overview');
  const [mosqueName, setMosqueName] = useState<string | undefined>(undefined);

  return (
    <AppShell
      activeRoute={activeRoute}
      onNavigate={setActiveRoute}
      mosqueName={mosqueName}
    >
      <OverviewFoundationPage
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        onMosqueNameChange={setMosqueName}
      />
    </AppShell>
  );
}

export default App;
