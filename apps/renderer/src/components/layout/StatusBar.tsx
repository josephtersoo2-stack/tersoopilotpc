import { useEffect } from 'react';

import { useFleetStore } from '../../stores/fleetStore';
import { LockIcon, ShieldCheckIcon } from '../icons';

export function StatusBar() {
  const { status, startPolling, stopPolling } = useFleetStore();

  useEffect(() => {
    startPolling(3000);
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  const leasesActive = status?.leasesActive ?? 0;
  const forwardersBound = status?.forwardersBound ?? 0;
  const queueStatus = status?.queueStatus ?? 'Idle';
  const memUsedGb = status?.memUsedGb ?? 0;
  const memTotalGb = status?.memTotalGb ?? 0;
  const memUsedPct = Math.min(100, Math.max(0, status?.memUsedPct ?? 0));
  const cpuUsagePct = Math.min(100, Math.max(0, status?.cpuUsagePct ?? 0));
  const dbSizeFormatted = status?.dbSizeFormatted ?? 'WAL Mode 0.0 MB';

  const queueColor = queueStatus.startsWith('Active')
    ? '#3b82f6'
    : queueStatus === 'Paused'
      ? '#f59e0b'
      : '#10b981';

  const cpuColor = cpuUsagePct > 80 ? '#ef4444' : cpuUsagePct > 50 ? '#f59e0b' : '#10b981';
  const memColor = memUsedPct > 85 ? '#ef4444' : memUsedPct > 70 ? '#f59e0b' : '#3b82f6';

  return (
    <footer
      style={{
        height: '28px',
        background: '#090d16',
        borderTop: '1px solid var(--border-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '11px',
        color: 'var(--text-dim)',
        userSelect: 'none',
        zIndex: 40,
      }}
    >
      {/* Left Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: queueColor,
              display: 'inline-block',
              boxShadow: queueStatus.startsWith('Active') ? '0 0 6px #3b82f6' : 'none',
            }}
          />
          <span>JobQueue</span>
          <span style={{ color: queueColor, fontWeight: 600 }}>{queueStatus}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <LockIcon size={12} color="#f59e0b" />
          <span>Leases Active:</span>
          <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{leasesActive}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <ShieldCheckIcon size={12} color="#3b82f6" />
          <span>LocalForwarders Bound:</span>
          <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{forwardersBound}</span>
        </div>
      </div>

      {/* Right Hardware & DB Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Memory meter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Memory: ${memUsedPct}% utilized`}>
          <span>
            Mem: {memUsedGb} GB / {memTotalGb} GB
          </span>
          <div
            style={{
              width: '40px',
              height: '5px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${memUsedPct}%`,
                height: '100%',
                background: memColor,
                borderRadius: '3px',
                transition: 'width 0.4s ease, background 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* CPU meter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`CPU: ${cpuUsagePct}% load`}>
          <span>CPU: {cpuUsagePct}%</span>
          <div
            style={{
              width: '40px',
              height: '5px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${cpuUsagePct}%`,
                height: '100%',
                background: cpuColor,
                borderRadius: '3px',
                transition: 'width 0.4s ease, background 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Database WAL mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#94a3b8' }}>💾 DB:</span>
          <span style={{ color: 'var(--text-main)' }}>{dbSizeFormatted}</span>
        </div>
      </div>
    </footer>
  );
}
