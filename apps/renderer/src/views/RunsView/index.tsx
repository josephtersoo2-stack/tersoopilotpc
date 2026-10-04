import { useEffect, useState } from 'react';
import type { RunSummary } from '@tersoo/contracts';
import { invokeIpc } from '../../lib/ipc';
import { formatDate } from '../../lib/formatters';
import { PlayIcon, RefreshIcon, StopIcon, TrashIcon } from '../../components/icons';

interface RunWithMeta extends RunSummary {
  captchaCount?: number;
}

type RunFilter = 'all' | 'queued' | 'running' | 'terminal';

export function RunsView() {
  const [runs, setRuns] = useState<RunWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RunFilter>('all');

  const loadRuns = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await invokeIpc('run.list', {});

      // Load captcha counts for each run
      const withCaptchas = await Promise.all(
        list.map(async (run) => {
          try {
            const events = await invokeIpc('captcha.events.list', { runId: run.id });
            return { ...run, captchaCount: Array.isArray(events) ? events.length : 0 };
          } catch {
            return { ...run, captchaCount: 0 };
          }
        }),
      );

      setRuns(withCaptchas);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns();
    const timer = setInterval(() => {
      void loadRuns();
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleCancelRun = async (id: string) => {
    try {
      setActionInProgress(id);
      await invokeIpc('run.cancel', { id });
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleResumeRun = async (id: string) => {
    try {
      setActionInProgress(id);
      await invokeIpc('run.resume', { id });
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteRun = async (id: string) => {
    try {
      setActionInProgress(id);
      await invokeIpc('run.delete', { id });
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelAllQueued = async () => {
    const queuedRuns = runs.filter((r) => r.state === 'queued');
    if (queuedRuns.length === 0) return;

    try {
      setActionInProgress('all_queued');
      await Promise.all(queuedRuns.map((r) => invokeIpc('run.cancel', { id: r.id })));
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClearTerminal = async () => {
    try {
      setActionInProgress('clear_terminal');
      await invokeIpc('run.clearTerminal');
      await loadRuns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  // Metrics
  const queuedCount = runs.filter((r) => r.state === 'queued').length;
  const runningCount = runs.filter((r) => r.state === 'running' || r.state === 'starting').length;
  const terminalCount = runs.filter(
    (r) => r.state === 'succeeded' || r.state === 'failed' || r.state === 'cancelled',
  ).length;

  const filteredRuns = runs.filter((r) => {
    if (activeFilter === 'queued') return r.state === 'queued';
    if (activeFilter === 'running') return r.state === 'running' || r.state === 'starting';
    if (activeFilter === 'terminal') {
      return r.state === 'succeeded' || r.state === 'failed' || r.state === 'cancelled';
    }
    return true;
  });

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Active Runs & Telemetry</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
            Real-time execution monitoring, execution queue controls, and automated CAPTCHA budget tracking.
          </p>

          {/* Quick Metrics Bar */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={() => setActiveFilter('all')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: activeFilter === 'all' ? '1px solid #3b82f6' : '1px solid var(--border-card)',
                background: activeFilter === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: activeFilter === 'all' ? '#60a5fa' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              All Runs ({runs.length})
            </button>
            <button
              onClick={() => setActiveFilter('queued')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: activeFilter === 'queued' ? '1px solid #f59e0b' : '1px solid var(--border-card)',
                background: activeFilter === 'queued' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: activeFilter === 'queued' ? '#fbbf24' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Queued ({queuedCount})
            </button>
            <button
              onClick={() => setActiveFilter('running')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: activeFilter === 'running' ? '1px solid #10b981' : '1px solid var(--border-card)',
                background: activeFilter === 'running' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: activeFilter === 'running' ? '#34d399' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Running ({runningCount})
            </button>
            <button
              onClick={() => setActiveFilter('terminal')}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: activeFilter === 'terminal' ? '1px solid #94a3b8' : '1px solid var(--border-card)',
                background: activeFilter === 'terminal' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: activeFilter === 'terminal' ? '#e2e8f0' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Finished ({terminalCount})
            </button>
          </div>
        </div>

        {/* Global Toolbar Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {queuedCount > 0 && (
            <button
              onClick={handleCancelAllQueued}
              disabled={actionInProgress !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                color: '#f43f5e',
                padding: '7px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Cancel all pending queued runs immediately"
            >
              <StopIcon size={13} />
              <span>Cancel All Queued ({queuedCount})</span>
            </button>
          )}

          {terminalCount > 0 && (
            <button
              onClick={handleClearTerminal}
              disabled={actionInProgress !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-card)',
                color: 'var(--text-muted)',
                padding: '7px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Remove finished, failed, and cancelled runs from history"
            >
              <TrashIcon size={13} />
              <span>Clear History</span>
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => void loadRuns()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px' }}
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

      {/* Main Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-card)',
                background: 'rgba(15, 23, 42, 0.75)',
                color: 'var(--text-dim)',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <th style={{ padding: '12px 16px' }}>Run ID</th>
              <th style={{ padding: '12px 16px' }}>Task ID</th>
              <th style={{ padding: '12px 16px' }}>Profile ID</th>
              <th style={{ padding: '12px 16px' }}>State</th>
              <th style={{ padding: '12px 16px' }}>CAPTCHA Counter</th>
              <th style={{ padding: '12px 16px' }}>Started</th>
              <th style={{ padding: '12px 16px' }}>Finished</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && runs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                  Loading runs...
                </td>
              </tr>
            ) : filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                  {activeFilter === 'all'
                    ? 'No active or past workflow runs found.'
                    : `No runs match filter "${activeFilter}".`}
                </td>
              </tr>
            ) : (
              filteredRuns.map((run) => {
                const captchaCount = run.captchaCount ?? 0;
                const isItemBusy = actionInProgress === run.id;

                let stateBadgeColor = 'var(--text-muted)';
                let stateBadgeBg = 'rgba(255, 255, 255, 0.05)';
                let stateBadgeBorder = 'rgba(255, 255, 255, 0.1)';

                if (run.state === 'running' || run.state === 'starting') {
                  stateBadgeColor = '#60a5fa';
                  stateBadgeBg = 'rgba(59, 130, 246, 0.15)';
                  stateBadgeBorder = 'rgba(59, 130, 246, 0.35)';
                } else if (run.state === 'queued') {
                  stateBadgeColor = '#fbbf24';
                  stateBadgeBg = 'rgba(245, 158, 11, 0.15)';
                  stateBadgeBorder = 'rgba(245, 158, 11, 0.35)';
                } else if (run.state === 'succeeded') {
                  stateBadgeColor = '#34d399';
                  stateBadgeBg = 'rgba(16, 185, 129, 0.15)';
                  stateBadgeBorder = 'rgba(16, 185, 129, 0.35)';
                } else if (run.state === 'failed' || run.state === 'cancelled') {
                  stateBadgeColor = '#f43f5e';
                  stateBadgeBg = 'rgba(244, 63, 94, 0.15)';
                  stateBadgeBorder = 'rgba(244, 63, 94, 0.35)';
                }

                return (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#60a5fa' }}>
                      {run.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {run.taskId.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {run.profileId.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: stateBadgeColor,
                          background: stateBadgeBg,
                          border: `1px solid ${stateBadgeBorder}`,
                        }}
                      >
                        {run.state === 'running' && (
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#60a5fa',
                              animation: 'pulse 1.5s infinite',
                            }}
                          />
                        )}
                        {run.state.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background:
                            captchaCount > 2
                              ? 'rgba(244, 63, 94, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color: captchaCount > 2 ? '#f43f5e' : '#f59e0b',
                          border: `1px solid ${
                            captchaCount > 2
                              ? 'rgba(244, 63, 94, 0.3)'
                              : 'rgba(245, 158, 11, 0.3)'
                          }`,
                        }}
                      >
                        CAPTCHA {captchaCount}/3
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {formatDate(run.startedAt)}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {formatDate(run.finishedAt)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        {/* QUEUED: Run Now + Cancel */}
                        {run.state === 'queued' && (
                          <>
                            <button
                              onClick={() => void handleResumeRun(run.id)}
                              disabled={isItemBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                color: '#60a5fa',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                              title="Start this queued run immediately"
                            >
                              <PlayIcon size={11} />
                              <span>Run Now</span>
                            </button>
                            <button
                              onClick={() => void handleCancelRun(run.id)}
                              disabled={isItemBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: 'rgba(244, 63, 94, 0.15)',
                                border: '1px solid rgba(244, 63, 94, 0.35)',
                                color: '#f43f5e',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                              title="Cancel queued run"
                            >
                              <StopIcon size={11} />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}

                        {/* RUNNING / STARTING: Cancel */}
                        {(run.state === 'running' || run.state === 'starting') && (
                          <button
                            onClick={() => void handleCancelRun(run.id)}
                            disabled={isItemBusy}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'rgba(244, 63, 94, 0.2)',
                              border: '1px solid #f43f5e',
                              color: '#ffffff',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                            }}
                            title="Halt active run"
                          >
                            <StopIcon size={12} />
                            <span>Cancel</span>
                          </button>
                        )}

                        {/* PAUSED / FAILED: Resume + Cancel */}
                        {(run.state === 'paused' || run.state === 'failed') && (
                          <>
                            <button
                              onClick={() => void handleResumeRun(run.id)}
                              disabled={isItemBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                color: '#60a5fa',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                              title="Resume or retry run"
                            >
                              <PlayIcon size={11} />
                              <span>Resume</span>
                            </button>
                            <button
                              onClick={() => void handleDeleteRun(run.id)}
                              disabled={isItemBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '4px 6px',
                                color: 'var(--text-dim)',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                              title="Delete record"
                            >
                              <TrashIcon size={12} />
                            </button>
                          </>
                        )}

                        {/* SUCCEEDED / CANCELLED: Re-run + Delete */}
                        {(run.state === 'succeeded' || run.state === 'cancelled') && (
                          <>
                            <button
                              onClick={() => void handleResumeRun(run.id)}
                              disabled={isItemBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-card)',
                                color: 'var(--text-muted)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                              title="Execute this run again"
                            >
                              <PlayIcon size={11} />
                              <span>Re-run</span>
                            </button>
                            <button
                              onClick={() => void handleDeleteRun(run.id)}
                              disabled={isItemBusy}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '4px 6px',
                                color: 'var(--text-dim)',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                              title="Remove from history"
                            >
                              <TrashIcon size={12} />
                            </button>
                          </>
                        )}
                      </div>
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

export default RunsView;
