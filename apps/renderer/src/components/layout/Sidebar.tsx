import { useState } from 'react';

import {
  BoltIcon,
  CpuIcon,
  DeviceDesktopIcon,
  LayersIcon,
  PlayIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TemplateIcon,
  WaveformIcon,
} from '../icons';

export interface SidebarProps {
  activeView?: string;
  onSelectView?: (view: string) => void;
}

export function Sidebar({ activeView = 'profiles', onSelectView }: SidebarProps) {
  const [currentView, setCurrentView] = useState(activeView);

  const handleSelect = (viewId: string) => {
    setCurrentView(viewId);
    onSelectView?.(viewId);
  };

  const navItems = [
    { id: 'profiles', label: 'Profiles', icon: DeviceDesktopIcon, badge: null },
    { id: 'niches', label: 'Niches', icon: LayersIcon, badge: null },
    { id: 'proxies', label: 'Proxy Vault', icon: ShieldCheckIcon, badge: null },
    { id: 'tasks', label: 'Task Studio', icon: BoltIcon, badge: null },
    { id: 'templates', label: 'Templates', icon: TemplateIcon, badge: 'New' },
    { id: 'fleet', label: 'Fleet Monitor', icon: CpuIcon, badge: null },
    { id: 'runs', label: 'Runs', icon: PlayIcon, badge: null },
    { id: 'logs', label: 'Logs', icon: WaveformIcon, badge: null },
    { id: 'prompts', label: 'Prompt Studio', icon: SparklesIcon, badge: null },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, badge: null },
  ];

  return (
    <aside
      style={{
        width: '200px',
        background: '#0a0e17',
        borderRight: '1px solid var(--border-card)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 12px',
        userSelect: 'none',
      }}
    >
      {/* Navigation List */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                background: isActive
                  ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.25) 0%, rgba(99, 102, 241, 0.15) 100%)'
                  : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-muted)',
                border: isActive
                  ? '1px solid rgba(59, 130, 246, 0.4)'
                  : '1px solid transparent',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 500,
                fontSize: '12px',
                transition: 'all var(--transition-fast)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = 'var(--text-main)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon size={16} color={isActive ? '#60a5fa' : 'currentColor'} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  style={{
                    background: '#3b82f6',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    lineHeight: '1.2',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Branding & Version Card */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <BoltIcon size={14} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>TersooPilot</span>
          <span style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.01em' }}>
            Automate • Scale • Dominate
          </span>
        </div>
      </div>
    </aside>
  );
}
