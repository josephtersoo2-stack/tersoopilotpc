import { useEffect, useState } from 'react';

import { Sidebar } from '../components/layout/Sidebar';
import { StatusBar } from '../components/layout/StatusBar';
import { Titlebar } from '../components/layout/Titlebar';
import { CopilotOrb, CopilotDrawer } from '../components/copilot';
import { WakeIndicator } from '../components/WakeIndicator';
import { useCopilotStore } from '../stores/copilotStore';
import { FleetMonitorView } from '../views/FleetMonitorView';
import { LogsView } from '../views/LogsView';
import { NichesView } from '../views/NichesView';
import { ProfilesView } from '../views/ProfilesView';
import { ProxyVaultView } from '../views/ProxyVaultView';
import { RunsView } from '../views/RunsView';
import { PromptsView } from '../views/PromptsView';
import { SettingsView } from '../views/SettingsView';
import { TaskStudioView } from '../views/TaskStudioView';
import { TemplatesView } from '../views/TemplatesView';

export function App() {
  const [currentView, setCurrentView] = useState('profiles');
  const toggleOpen = useCopilotStore((s) => s.toggleOpen);

  // Global shortcut: Ctrl+K or Cmd+K toggles Copilot
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleOpen();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [toggleOpen]);

  const renderView = () => {
    switch (currentView) {
      case 'profiles':
        return <ProfilesView />;
      case 'niches':
        return <NichesView />;
      case 'proxies':
        return <ProxyVaultView />;
      case 'tasks':
        return <TaskStudioView />;
      case 'templates':
        return <TemplatesView onSelectView={setCurrentView} />;
      case 'fleet':
        return <FleetMonitorView />;
      case 'runs':
        return <RunsView />;
      case 'logs':
        return <LogsView />;
      case 'prompts':
        return <PromptsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <ProfilesView />;
    }
  };

  return (
    <div className="app-container">
      {/* Top Application Titlebar */}
      <Titlebar activeView={currentView} onSelectView={setCurrentView} />

      {/* Main App Body */}
      <div className="app-body">
        {/* Sidebar */}
        <Sidebar activeView={currentView} onSelectView={setCurrentView} />

        {/* Dynamic Main Viewport */}
        <main className="main-viewport">{renderView()}</main>
      </div>

      {/* Global Status Bar */}
      <StatusBar />

      {/* Global Embedded Tersoo Copilot: Draggable Orb & Drawer */}
      <WakeIndicator />
      <CopilotOrb />
      <CopilotDrawer currentView={currentView} onSelectView={setCurrentView} />
    </div>
  );
}

export default App;
