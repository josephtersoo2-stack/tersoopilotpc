import {
  BoltIcon,
  GlobeIcon,
  PlusIcon,
  RefreshIcon,
  ShieldCheckIcon,
  UploadIcon,
} from '../../components/icons';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

export function ProxyVaultHeader() {
  const {
    stats,
    proxies,
    isCheckingAll,
    checkAll,
    setAddModalOpen,
    setBulkImportModalOpen,
  } = useProxyVaultStore();

  const socks5Count = proxies.filter((p) => p.protocol === 'socks5').length;
  const httpCount = proxies.filter((p) => p.protocol === 'http' || p.protocol === 'https').length;
  const healthRate = stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
      {/* Top Banner Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
              Proxy Vault
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '9999px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Forwarder Active
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
            Upstream proxy infrastructure with zero-leak local forwarder tunneling & atomic profile leasing.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => void checkAll()}
            disabled={isCheckingAll || proxies.length === 0}
            title="Probe health across entire proxy pool"
          >
            <RefreshIcon size={14} className={isCheckingAll ? 'animate-spin' : ''} />
            <span>{isCheckingAll ? 'Probing Pool...' : 'Check All'}</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setBulkImportModalOpen(true)}
            title="Import proxy lists in text or file formats"
          >
            <UploadIcon size={14} />
            <span>Bulk Ingest</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => setAddModalOpen(true)}
            title="Add a single proxy endpoint to the pool"
          >
            <PlusIcon size={14} />
            <span>Add Proxy</span>
          </button>
        </div>
      </div>

      {/* 4 Rich Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Metric 1: Total Proxies */}
        <div className="glass-panel" style={{ padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Proxies
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
              }}
            >
              <GlobeIcon size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
              {stats.total}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {socks5Count} SOCKS5 · {httpCount} HTTP
            </span>
          </div>
        </div>

        {/* Metric 2: Healthy Nodes */}
        <div className="glass-panel" style={{ padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Healthy Pool
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--color-success-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-success)',
              }}
            >
              <ShieldCheckIcon size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)', fontFamily: 'monospace' }}>
              {stats.healthy}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 6px', borderRadius: '4px' }}>
              {healthRate}% Available
            </span>
          </div>
        </div>

        {/* Metric 3: Active Leases */}
        <div className="glass-panel" style={{ padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Degraded / Dead
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: stats.dead > 0 || stats.authError > 0 ? 'var(--color-danger-bg)' : 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: stats.dead > 0 || stats.authError > 0 ? 'var(--color-danger)' : 'var(--text-dim)',
              }}
            >
              <BoltIcon size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: stats.slow + stats.dead + stats.authError > 0 ? 'var(--color-warning)' : '#ffffff', fontFamily: 'monospace' }}>
              {stats.slow + stats.dead + stats.authError}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {stats.slow} slow · {stats.authError} auth · {stats.dead} dead
            </span>
          </div>
        </div>

        {/* Metric 4: Avg Response Latency */}
        <div className="glass-panel" style={{ padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Average Latency
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(139, 92, 246, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-purple)',
              }}
            >
              <BoltIcon size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
              {stats.avgLatency > 0 ? `${stats.avgLatency}ms` : '--'}
            </span>
            {stats.avgLatency > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: stats.avgLatency < 150 ? 'var(--color-success)' : stats.avgLatency < 500 ? 'var(--color-warning)' : 'var(--color-danger)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: stats.avgLatency < 150 ? 'var(--color-success-bg)' : stats.avgLatency < 500 ? 'var(--color-warning-bg)' : 'var(--color-danger-bg)',
                }}
              >
                {stats.avgLatency < 150 ? 'Optimal' : stats.avgLatency < 500 ? 'Moderate' : 'High Latency'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
