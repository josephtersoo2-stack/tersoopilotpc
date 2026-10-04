import { useState } from 'react';

import {
  ChevronDownIcon,
  DeviceMobileIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserIcon,
} from '../../components/icons';
import { useFleetStore } from '../../stores/fleetStore';
import { useProfilesStore } from '../../stores/profilesStore';

export function ProfileStudioHeader() {
  const { stats, openCreateModal, profiles, launchProfile } = useProfilesStore();
  const { status: fleetStatus } = useFleetStore();
  const [quickLaunchOpen, setQuickLaunchOpen] = useState(false);

  const idleProfiles = profiles.filter((p) => p.state === 'idle');

  const handleQuickLaunch = async () => {
    if (idleProfiles.length > 0 && idleProfiles[0]) {
      await launchProfile(idleProfiles[0].id);
    }
    setQuickLaunchOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
      {/* Top Banner Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Profile Studio
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Manage your device profiles, proxies and automation fleet.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
          <button className="btn btn-primary" onClick={openCreateModal}>
            <PlusIcon size={14} />
            <span>New Profile</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setQuickLaunchOpen(!quickLaunchOpen)}
          >
            <span>Quick Launch</span>
            <ChevronDownIcon size={12} />
          </button>

          {quickLaunchOpen && (
            <div
              className="glass-panel animate-fade-in"
              style={{
                position: 'absolute',
                top: '40px',
                right: '0',
                width: '220px',
                padding: '8px',
                zIndex: 40,
                background: '#0f172a',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', padding: '4px 8px', fontWeight: 600 }}>
                AVAILABLE IDLE PROFILES
              </div>
              {idleProfiles.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px' }}>
                  No idle profiles found
                </div>
              ) : (
                idleProfiles.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      void launchProfile(p.id);
                      setQuickLaunchOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <PlayIcon size={10} color="#34d399" />
                  </button>
                ))
              )}
              {idleProfiles.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '4px', paddingTop: '4px' }}>
                  <button
                    onClick={() => { void handleQuickLaunch(); }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#60a5fa',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Launch First Available
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4 Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {/* Card 1: Total Profiles */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              flexShrink: 0,
            }}
          >
            <UserIcon size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Total Profiles
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>{stats.total || profiles.length}</span>
              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>↑ 12%</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
              Active & configured profiles
            </div>
          </div>
        </div>

        {/* Card 2: Active Instances */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              flexShrink: 0,
            }}
          >
            <DeviceMobileIcon size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Active Instances
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>
                {fleetStatus?.activeInstances ?? stats.running} / {Math.max(12, profiles.length)}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>(42% RAM)</span>
            </div>
            {/* Mini Progress */}
            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.round(((fleetStatus?.activeInstances ?? stats.running) / Math.max(1, profiles.length)) * 100))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #6366f1 0%, #3b82f6 100%)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Healthy Proxies */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
              flexShrink: 0,
            }}
          >
            <ShieldCheckIcon size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Healthy Proxies
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>
                {stats.proxiesHealthy} / {stats.proxiesTotal}
              </span>
              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>
                ({stats.proxiesTotal > 0 ? Math.round((stats.proxiesHealthy / stats.proxiesTotal) * 100) : 0}%)
              </span>
            </div>
            {/* Green progress bar */}
            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${stats.proxiesTotal > 0 ? Math.min(100, Math.round((stats.proxiesHealthy / stats.proxiesTotal) * 100)) : 0}%`,
                  height: '100%',
                  background: '#10b981',
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Active Runs */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a78bfa',
              flexShrink: 0,
            }}
          >
            <PlayIcon size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Active Runs
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>
                {fleetStatus?.runningRuns ?? 0} Running
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
              ({stats.idle} Idle{stats.crashed > 0 ? ` / ${stats.crashed} Crashed` : ''})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
