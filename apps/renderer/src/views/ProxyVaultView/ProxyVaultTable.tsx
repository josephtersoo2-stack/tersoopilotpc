import { useMemo } from 'react';

import {
  CopyIcon,
  GlobeIcon,
  LinkIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

function getCountryFlag(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function ProxyVaultTable() {
  const {
    proxies,
    loading,
    searchQuery,
    protocolFilter,
    statusFilter,
    sortField,
    sortDirection,
    selectedIds,
    currentPage,
    pageSize,
    checkingProxyIds,
    setSort,
    setCurrentPage,
    setPageSize,
    toggleSelect,
    toggleSelectAll,
    checkProxy,
    deleteProxy,
    setAddModalOpen,
    setBulkImportModalOpen,
    setAssignModalOpen,
  } = useProxyVaultStore();

  const { profiles } = useProfilesStore();

  // Create lookup of proxyId -> profile that holds lease
  const profileByProxy = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of profiles) {
      if (p.proxyId) {
        map.set(p.proxyId, { id: p.id, name: p.name });
      }
    }
    return map;
  }, [profiles]);

  // Filter & Sort
  const filtered = useMemo(() => {
    let result = [...proxies];

    if (protocolFilter !== 'all') {
      result = result.filter((p) => p.protocol === protocolFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.host.toLowerCase().includes(q) ||
          (p.username && p.username.toLowerCase().includes(q)) ||
          (p.geoCountry && p.geoCountry.toLowerCase().includes(q)) ||
          (p.geoCity && p.geoCity.toLowerCase().includes(q)) ||
          (p.geoIsp && p.geoIsp.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      switch (sortField) {
        case 'protocol':
          valA = a.protocol;
          valB = b.protocol;
          break;
        case 'host':
          valA = a.host;
          valB = b.host;
          break;
        case 'port':
          valA = a.port;
          valB = b.port;
          break;
        case 'latency':
          valA = a.lastLatencyMs ?? 999999;
          valB = b.lastLatencyMs ?? 999999;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'country':
          valA = a.geoCountry ?? '';
          valB = b.geoCountry ?? '';
          break;
        case 'createdAt':
        default:
          valA = a.createdAt;
          valB = b.createdAt;
          break;
      }

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      const comp = valA < valB ? -1 : 1;
      return sortDirection === 'asc' ? comp : -comp;
    });

    return result;
  }, [proxies, protocolFilter, statusFilter, searchQuery, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const allPageIds = useMemo(() => paginated.map((p) => p.id), [paginated]);
  const isAllSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to remove this proxy from the vault?')) {
      await deleteProxy(id);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-card)',
        overflow: 'hidden',
      }}
    >
      {/* Table Container */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                background: 'rgba(255, 255, 255, 0.02)',
                color: 'var(--text-muted)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                userSelect: 'none',
              }}
            >
              <th style={{ width: '40px', padding: '12px 14px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={() => toggleSelectAll(allPageIds)}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th
                style={{ padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => setSort('protocol')}
              >
                Protocol {sortField === 'protocol' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                style={{ padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => setSort('host')}
              >
                Endpoint {sortField === 'host' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                style={{ padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => setSort('country')}
              >
                Location {sortField === 'country' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                style={{ padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => setSort('latency')}
              >
                Latency {sortField === 'latency' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                style={{ padding: '12px 16px', cursor: 'pointer' }}
                onClick={() => setSort('status')}
              >
                Status {sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '12px 16px' }}>Lease / Binding</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'rgba(59, 130, 246, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-primary)',
                      }}
                    >
                      <GlobeIcon size={24} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
                      {loading ? 'Loading Proxies...' : 'No Proxies Found'}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', margin: 0 }}>
                      {loading
                        ? 'Connecting to proxy vault...'
                        : 'Your proxy pool is currently empty or does not match the active filter criteria.'}
                    </p>
                    {!loading && (
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        <button className="btn btn-secondary" onClick={() => setBulkImportModalOpen(true)}>
                          Import Proxy List
                        </button>
                        <button className="btn btn-primary" onClick={() => setAddModalOpen(true)}>
                          <PlusIcon size={14} />
                          <span>Add Proxy</span>
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((proxy) => {
                const isSelected = selectedIds.has(proxy.id);
                const isChecking = checkingProxyIds.has(proxy.id);
                const boundProfile = profileByProxy.get(proxy.id);

                return (
                  <tr
                    key={proxy.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                      transition: 'background var(--transition-fast)',
                    }}
                    className="hover-row"
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(proxy.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>

                    {/* Protocol */}
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          background:
                            proxy.protocol === 'socks5'
                              ? 'rgba(6, 182, 212, 0.12)'
                              : proxy.protocol === 'https'
                                ? 'rgba(168, 85, 247, 0.12)'
                                : 'rgba(59, 130, 246, 0.12)',
                          color:
                            proxy.protocol === 'socks5'
                              ? '#22d3ee'
                              : proxy.protocol === 'https'
                                ? '#c084fc'
                                : '#60a5fa',
                          border: `1px solid ${
                            proxy.protocol === 'socks5'
                              ? 'rgba(6, 182, 212, 0.25)'
                              : proxy.protocol === 'https'
                                ? 'rgba(168, 85, 247, 0.25)'
                                : 'rgba(59, 130, 246, 0.25)'
                          }`,
                        }}
                      >
                        {proxy.protocol}
                      </span>
                    </td>

                    {/* Endpoint */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                            {proxy.host}:{proxy.port}
                          </span>
                          <button
                            onClick={() => copyToClipboard(`${proxy.host}:${proxy.port}`)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-dim)',
                              cursor: 'pointer',
                              padding: '2px',
                            }}
                            title="Copy host:port"
                          >
                            <CopyIcon size={12} />
                          </button>
                        </div>
                        {proxy.username && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            User: {proxy.username}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Location */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{getCountryFlag(proxy.geoCountry)}</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                            {proxy.geoCity ? `${proxy.geoCity}, ` : ''}{proxy.geoCountry ?? 'Unknown'}
                          </span>
                          {proxy.geoIsp && (
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {proxy.geoIsp}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Latency */}
                    <td style={{ padding: '12px 16px' }}>
                      {proxy.lastLatencyMs !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              fontSize: '12px',
                              color:
                                proxy.lastLatencyMs < 200
                                  ? 'var(--color-success)'
                                  : proxy.lastLatencyMs < 1000
                                    ? 'var(--color-warning)'
                                    : 'var(--color-danger)',
                            }}
                          >
                            {proxy.lastLatencyMs}ms
                          </span>
                          {/* Mini visual indicator */}
                          <div
                            style={{
                              width: '36px',
                              height: '4px',
                              borderRadius: '2px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(100, Math.max(10, 100 - proxy.lastLatencyMs / 25))}%`,
                                background:
                                  proxy.lastLatencyMs < 200
                                    ? 'var(--color-success)'
                                    : proxy.lastLatencyMs < 1000
                                      ? 'var(--color-warning)'
                                      : 'var(--color-danger)',
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Unchecked</span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background:
                              proxy.status === 'healthy'
                                ? 'var(--color-success)'
                                : proxy.status === 'slow'
                                  ? 'var(--color-warning)'
                                  : proxy.status === 'auth_error'
                                    ? '#ea580c'
                                    : proxy.status === 'dead'
                                      ? 'var(--color-danger)'
                                      : 'var(--text-dim)',
                            boxShadow:
                              proxy.status === 'healthy'
                                ? '0 0 8px rgba(16, 185, 129, 0.5)'
                                : proxy.status === 'slow'
                                  ? '0 0 8px rgba(245, 158, 11, 0.5)'
                                  : 'none',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            textTransform: 'capitalize',
                            color:
                              proxy.status === 'healthy'
                                ? 'var(--color-success)'
                                : proxy.status === 'slow'
                                  ? 'var(--color-warning)'
                                  : proxy.status === 'auth_error'
                                    ? '#fb923c'
                                    : proxy.status === 'dead'
                                      ? 'var(--color-danger)'
                                      : 'var(--text-muted)',
                          }}
                        >
                          {proxy.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    {/* Lease / Binding */}
                    <td style={{ padding: '12px 16px' }}>
                      {boundProfile ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(99, 102, 241, 0.12)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '11px',
                            color: '#a5b4fc',
                            fontWeight: 500,
                          }}
                          title={`Leased to ${boundProfile.name}`}
                        >
                          <LinkIcon size={12} />
                          <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {boundProfile.name}
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-dim)',
                            background: 'rgba(255, 255, 255, 0.04)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                          }}
                        >
                          Available
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => void checkProxy(proxy.id)}
                          disabled={isChecking}
                          title="Probe connection health"
                        >
                          <RefreshIcon size={12} className={isChecking ? 'animate-spin' : ''} />
                          <span>{isChecking ? 'Testing...' : 'Test'}</span>
                        </button>

                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => setAssignModalOpen(true, proxy)}
                          title="Bind proxy to profile"
                        >
                          <LinkIcon size={12} />
                          <span>Bind</span>
                        </button>

                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 6px', color: 'var(--color-danger)' }}
                          onClick={() => void handleDelete(proxy.id)}
                          title="Remove proxy"
                        >
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filtered.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            Showing <strong style={{ color: '#ffffff' }}>{(safePage - 1) * pageSize + 1}</strong> to{' '}
            <strong style={{ color: '#ffffff' }}>
              {Math.min(safePage * pageSize, filtered.length)}
            </strong>{' '}
            of <strong style={{ color: '#ffffff' }}>{filtered.length}</strong> proxies
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Per page:</span>
              <select
                className="input"
                style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(safePage - 1)}
              >
                Prev
              </button>
              <span style={{ padding: '0 8px', color: '#ffffff', fontWeight: 600 }}>
                {safePage} / {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
