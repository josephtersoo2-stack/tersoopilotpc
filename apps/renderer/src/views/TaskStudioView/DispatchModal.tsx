import { useEffect, useState } from 'react';
import type { FailurePolicy } from '@tersoo/contracts';

import { CheckIcon, PlayIcon, XIcon } from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';
import { useTasksStore } from '../../stores/tasksStore';

export function DispatchModal() {
  const { isDispatchModalOpen, closeDispatchModal, dispatchTask, isDispatching, currentWorkflow } =
    useTasksStore();
  const { profiles, loadProfiles } = useProfilesStore();

  const [targetMode, setTargetMode] = useState<'all' | 'specific'>('all');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState(5);
  const [staggerMinMs, setStaggerMinMs] = useState(5000);
  const [staggerMaxMs, setStaggerMaxMs] = useState(15000);
  const [failurePolicy, setFailurePolicy] = useState<FailurePolicy>('retry');
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [dispatchedRunIds, setDispatchedRunIds] = useState<string[] | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  useEffect(() => {
    if (isDispatchModalOpen) {
      void loadProfiles();
      setDispatchedRunIds(null);
      setDispatchError(null);
    }
  }, [isDispatchModalOpen, loadProfiles]);

  if (!isDispatchModalOpen) return null;

  const handleToggleProfile = (id: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleDispatch = async () => {
    setDispatchError(null);
    try {
      const targets =
        targetMode === 'all'
          ? { all: true }
          : { profileIds: selectedProfileIds };

      if (targetMode === 'specific' && selectedProfileIds.length === 0) {
        setDispatchError('Please select at least one profile to target.');
        return;
      }

      const res = await dispatchTask(targets, {
        concurrency,
        staggerMinMs,
        staggerMaxMs,
        failurePolicy,
        maxAttempts,
      });

      setDispatchedRunIds(res.runIds);
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Dispatch failed');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDispatchModal();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#0d131f',
          border: '1px solid var(--border-card-highlight)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(59, 130, 246, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: 0 }}>
              Dispatch Automation Workflow
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Target: <span style={{ color: '#93c5fd', fontWeight: 600 }}>{currentWorkflow.name}</span> ({currentWorkflow.steps.length} steps)
            </p>
          </div>

          <button
            onClick={closeDispatchModal}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {dispatchedRunIds ? (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                }}
              >
                <CheckIcon size={20} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: 0 }}>
                Successfully Dispatched {dispatchedRunIds.length} Run{dispatchedRunIds.length > 1 ? 's' : ''}!
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Workflow execution enqueued in background governor queue.
              </p>
              <button
                onClick={closeDispatchModal}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 20px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  marginTop: '8px',
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Target Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                  Profile Targets
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      background: targetMode === 'all' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-input)',
                      border: targetMode === 'all' ? '1px solid #3b82f6' : '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: targetMode === 'all' ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    <input
                      type="radio"
                      name="targetMode"
                      checked={targetMode === 'all'}
                      onChange={() => setTargetMode('all')}
                    />
                    <span>All Profiles ({profiles.length})</span>
                  </label>

                  <label
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      background: targetMode === 'specific' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-input)',
                      border: targetMode === 'specific' ? '1px solid #3b82f6' : '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: targetMode === 'specific' ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    <input
                      type="radio"
                      name="targetMode"
                      checked={targetMode === 'specific'}
                      onChange={() => setTargetMode('specific')}
                    />
                    <span>Specific Profiles</span>
                  </label>
                </div>

                {targetMode === 'specific' && (
                  <div
                    style={{
                      marginTop: '6px',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      border: '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px',
                      background: 'var(--bg-input)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {profiles.map((p) => {
                      const isChecked = selectedProfileIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: isChecked ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#fff',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleProfile(p.id)}
                          />
                          <span>{p.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                            {p.platform}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Execution Options: Concurrency & Stagger */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Concurrency Limit ({concurrency})
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Failure Policy
                  </label>
                  <select
                    value={failurePolicy}
                    onChange={(e) => setFailurePolicy(e.target.value as FailurePolicy)}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      padding: '6px 10px',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  >
                    <option value="retry">Retry on failure</option>
                    <option value="skip">Skip remaining steps</option>
                    <option value="screenshot_abort">Screenshot & Abort</option>
                    <option value="pause_alert">Pause & Alert</option>
                  </select>
                </div>
              </div>

              {/* Stagger delays */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Stagger Min (ms)
                  </label>
                  <input
                    type="number"
                    value={staggerMinMs}
                    onChange={(e) => setStaggerMinMs(Number(e.target.value))}
                    step={1000}
                    min={0}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Stagger Max (ms)
                  </label>
                  <input
                    type="number"
                    value={staggerMaxMs}
                    onChange={(e) => setStaggerMaxMs(Number(e.target.value))}
                    step={1000}
                    min={staggerMinMs}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Max Attempts
                  </label>
                  <input
                    type="number"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    min={1}
                    max={10}
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              {dispatchError && (
                <div style={{ color: '#f43f5e', fontSize: '12px', background: 'rgba(244, 63, 94, 0.1)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  {dispatchError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!dispatchedRunIds && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-subtle)',
              background: 'rgba(10, 14, 23, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button
              onClick={closeDispatchModal}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-card)',
                color: 'var(--text-muted)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>

            <button
              onClick={() => {
                void handleDispatch();
              }}
              disabled={isDispatching}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: 'var(--radius-md)',
                cursor: isDispatching ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                boxShadow: '0 0 16px rgba(59, 130, 246, 0.4)',
                opacity: isDispatching ? 0.7 : 1,
              }}
            >
              <PlayIcon size={12} />
              <span>{isDispatching ? 'Dispatching...' : 'Start Execution'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
