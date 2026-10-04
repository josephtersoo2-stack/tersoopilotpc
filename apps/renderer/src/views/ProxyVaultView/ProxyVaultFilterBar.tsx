import {
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from '../../components/icons';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

export function ProxyVaultFilterBar() {
  const {
    searchQuery,
    protocolFilter,
    statusFilter,
    selectedIds,
    setSearchQuery,
    setProtocolFilter,
    setStatusFilter,
    clearSelection,
    bulkCheck,
    bulkDelete,
  } = useProxyVaultStore();

  const protocols: Array<'all' | 'socks5' | 'http' | 'https'> = ['all', 'socks5', 'http', 'https'];
  const statuses: Array<'all' | 'healthy' | 'slow' | 'auth_error' | 'dead' | 'unknown'> = [
    'all',
    'healthy',
    'slow',
    'auth_error',
    'dead',
    'unknown',
  ];

  const selectedCount = selectedIds.size;

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} selected proxies?`)) {
      await bulkDelete(Array.from(selectedIds));
    }
  };

  const handleBulkCheck = async () => {
    await bulkCheck(Array.from(selectedIds));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px',
        background: 'var(--bg-card)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <SearchIcon size={14} />
          </div>
          <input
            type="text"
            className="input"
            placeholder="Search host, username, country, ISP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '34px', width: '100%', fontSize: '13px' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              <XIcon size={12} />
            </button>
          )}
        </div>

        {/* Protocol Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-input)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
          {protocols.map((proto) => {
            const active = protocolFilter === proto;
            return (
              <button
                key={proto}
                onClick={() => setProtocolFilter(proto)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  background: active ? 'var(--color-primary)' : 'transparent',
                  color: active ? '#ffffff' : 'var(--text-muted)',
                  transition: 'var(--transition-fast)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {proto}
              </button>
            );
          })}
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {statuses.map((status) => {
            const active = statusFilter === status;
            const label = status === 'all' ? 'All Status' : status.replace('_', ' ');
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: active
                    ? '1px solid var(--color-primary)'
                    : '1px solid var(--border-subtle)',
                  fontSize: '11px',
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  color: active ? '#93c5fd' : 'var(--text-muted)',
                  transition: 'var(--transition-fast)',
                  textTransform: 'capitalize',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Multi-Selection Context Bar */}
      {selectedCount > 0 && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#93c5fd',
                background: 'rgba(59, 130, 246, 0.2)',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              {selectedCount} Selected
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Bulk actions for selected proxy endpoints
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => void handleBulkCheck()}>
              <RefreshIcon size={12} />
              <span>Test Selected</span>
            </button>

            <button
              className="btn btn-secondary"
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                color: 'var(--color-danger)',
                borderColor: 'var(--color-danger-border)',
              }}
              onClick={() => void handleBulkDelete()}
            >
              <TrashIcon size={12} />
              <span>Delete</span>
            </button>

            <button
              onClick={clearSelection}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
              title="Clear selection"
            >
              <XIcon size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
