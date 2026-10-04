import { useEffect, useState } from 'react';
import { invokeIpc } from '../../lib/ipc';
import { RefreshIcon, SearchIcon } from '../../components/icons';

interface LogEvent {
  id: number;
  ts: number;
  level: string;
  scope: string;
  event: string;
  profile_id: string | null;
  run_id: string | null;
  step_run_id: string | null;
  data: string;
}

export function LogsView() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedScope, setSelectedScope] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLogs = async () => {
    try {
      setError(null);
      const queryFilter: { limit: number; scope?: string } = { limit: 200 };
      if (selectedScope !== 'all') {
        queryFilter.scope = selectedScope;
      }
      const result = await invokeIpc('logs.query', queryFilter);
      if (Array.isArray(result)) {
        setLogs(result as LogEvent[]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedScope]);

  const filteredLogs = logs.filter((log) => {
    if (selectedLevel !== 'all' && log.level.toLowerCase() !== selectedLevel.toLowerCase()) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.event.toLowerCase().includes(term) ||
      log.scope.toLowerCase().includes(term) ||
      (log.profile_id && log.profile_id.toLowerCase().includes(term)) ||
      (log.run_id && log.run_id.toLowerCase().includes(term)) ||
      log.data.toLowerCase().includes(term)
    );
  });

  const getLevelBadge = (level: string) => {
    const l = level.toLowerCase();
    let bg = 'rgba(148, 163, 184, 0.15)';
    let color = '#94a3b8';
    let border = 'rgba(148, 163, 184, 0.3)';

    if (l === 'info') {
      bg = 'rgba(16, 185, 129, 0.15)';
      color = '#10b981';
      border = 'rgba(16, 185, 129, 0.3)';
    } else if (l === 'warn') {
      bg = 'rgba(245, 158, 11, 0.15)';
      color = '#f59e0b';
      border = 'rgba(245, 158, 11, 0.3)';
    } else if (l === 'error' || l === 'fatal') {
      bg = 'rgba(244, 63, 94, 0.15)';
      color = '#f43f5e';
      border = 'rgba(244, 63, 94, 0.3)';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          backgroundColor: bg,
          color,
          border: `1px solid ${border}`,
        }}
      >
        {level}
      </span>
    );
  };

  const getScopeBadge = (scope: string) => {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          color: 'var(--text-muted, #94a3b8)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {scope}
      </span>
    );
  };

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            System Event Stream & Observability
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
            Structured telemetry, state transitions, security events, and audit logs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className={`btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {autoRefresh ? '● Live Polling (3s)' : '○ Paused'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void fetchLogs()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <RefreshIcon size={14} className={loading ? 'pulse' : ''} />
            <span>Refresh</span>
          </button>
        </div>
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

      {/* Filter Toolbar */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 18px',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <SearchIcon
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)',
            }}
          />
          <input
            type="text"
            className="input"
            placeholder="Search event, data payload, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '12px' }}
          />
        </div>

        {/* Scope Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Scope:</span>
          <select
            className="input"
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value)}
            style={{ height: '36px', fontSize: '12px', padding: '0 12px' }}
          >
            <option value="all">All Scopes</option>
            <option value="supervisor">supervisor</option>
            <option value="proxy">proxy</option>
            <option value="task">task</option>
            <option value="ui">ui</option>
            <option value="security">security</option>
            <option value="db">db</option>
          </select>
        </div>

        {/* Level Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Level:</span>
          <select
            className="input"
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            style={{ height: '36px', fontSize: '12px', padding: '0 12px' }}
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          Showing {filteredLogs.length} events
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, width: '140px' }}>
                TIMESTAMP
              </th>
              <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, width: '90px' }}>
                LEVEL
              </th>
              <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, width: '110px' }}>
                SCOPE
              </th>
              <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                EVENT & DETAILS
              </th>
              <th style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, width: '130px' }}>
                PROFILE / RUN
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
                  {loading ? 'Fetching telemetry stream...' : 'No event logs match the current filters.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                let parsedData: unknown = null;
                try {
                  parsedData = JSON.parse(log.data);
                } catch {
                  parsedData = log.data;
                }

                return (
                  <tr
                    key={log.id}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {new Date(log.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                        .{String(log.ts % 1000).padStart(3, '0')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{getLevelBadge(log.level)}</td>
                    <td style={{ padding: '12px 16px' }}>{getScopeBadge(log.scope)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        {log.event}
                      </div>
                      {isExpanded ? (
                        <div
                          style={{
                            marginTop: '8px',
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: '#0a0f1d',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: '#cbd5e1',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: '260px',
                            overflowY: 'auto',
                          }}
                        >
                          {typeof parsedData === 'object' && parsedData !== null
                            ? JSON.stringify(parsedData, null, 2)
                            : String(parsedData)}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-dim)',
                            marginTop: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '480px',
                            fontFamily: 'monospace',
                          }}
                        >
                          {typeof parsedData === 'object' && parsedData !== null
                            ? JSON.stringify(parsedData)
                            : String(parsedData)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      {log.profile_id && <div>P: {log.profile_id.slice(0, 8)}</div>}
                      {log.run_id && <div>R: {log.run_id.slice(0, 8)}</div>}
                      {!log.profile_id && !log.run_id && <span>—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LogsView;
