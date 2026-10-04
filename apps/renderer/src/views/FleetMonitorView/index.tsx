import { useEffect, useState } from 'react';
import type { FleetStatus, ProfileSummary } from '@tersoo/contracts';
import { invokeIpc } from '../../lib/ipc';
import { formatUptime } from '../../lib/formatters';
import { BoltIcon, DeviceDesktopIcon, RefreshIcon, StopIcon } from '../../components/icons';

export function FleetMonitorView() {
  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [f, pList] = await Promise.all([
        invokeIpc('fleet.status'),
        invokeIpc('profile.list', {}),
      ]);
      setFleet(f);
      setProfiles(pList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => {
      void loadData();
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleStopProfile = async (id: string) => {
    try {
      await invokeIpc('profile.stop', { id });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runningProfiles = profiles.filter(
    (p) => p.state === 'running' || fleet?.runningProfiles.includes(p.id),
  );

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Fleet Monitor & Live Telemetry
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
            Live browser processes across Apostate and Camoufox engines, leases, and local forwarders.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => void loadData()}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshIcon size={14} className={loading ? 'pulse' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#f43f5e',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Instances
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', marginTop: '4px' }}>
            {fleet?.activeInstances ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>
            {fleet?.running ?? 0} profiles running
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Leases
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6', marginTop: '4px' }}>
            {fleet?.leasesActive ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Dedicated proxies held
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
            Forwarders Bound
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#8b5cf6', marginTop: '4px' }}>
            {fleet?.forwardersBound ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Active local proxy tunnels
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
            Healthy Proxies
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            {fleet?.proxiesHealthy ?? 0} / {fleet?.proxiesTotal ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Vault pool status
          </div>
        </div>
      </div>

      {/* Instance Tiles with Engine Badges */}
      <div>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', marginBottom: '14px' }}>
          Running Instances ({runningProfiles.length})
        </h2>

        {runningProfiles.length === 0 ? (
          <div
            className="glass-panel"
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-dim)',
            }}
          >
            No active browser instances currently running. Launch a profile from Profile Studio to inspect live processes.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {runningProfiles.map((p) => {
              const isCamoufox = p.engine === 'camoufox';
              return (
                <div
                  key={p.id}
                  className="glass-panel"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: `1px solid ${isCamoufox ? 'rgba(249, 115, 22, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isCamoufox ? 'rgba(249, 115, 22, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <DeviceDesktopIcon size={16} color={isCamoufox ? '#fb923c' : '#60a5fa'} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '13px' }}>
                            {p.name}
                          </span>
                          {/* Engine Badge */}
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '3px',
                              background: isCamoufox ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                              color: isCamoufox ? '#fb923c' : '#60a5fa',
                              border: `1px solid ${isCamoufox ? 'rgba(249, 115, 22, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {p.engine ?? 'apostate'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          Platform: {p.platform}
                        </div>
                      </div>
                    </div>

                    <span className="badge badge-running">
                      <span className="status-dot online pulse" style={{ width: '6px', height: '6px' }} />
                      <span>LIVE</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>Uptime: {formatUptime(p.lastLaunchedAt)}</span>
                    <span>CAPTCHAs: {p.captchaBudgetUsed ?? 0}/3</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => void handleStopProfile(p.id)}
                      style={{ padding: '4px 10px', fontSize: '11px', color: '#f43f5e' }}
                    >
                      <StopIcon size={12} />
                      <span>Terminate Instance</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default FleetMonitorView;
