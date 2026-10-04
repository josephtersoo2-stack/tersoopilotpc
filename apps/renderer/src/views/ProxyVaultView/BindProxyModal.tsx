import { useState, type FormEvent } from 'react';

import { LinkIcon, XIcon } from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

export function BindProxyModal() {
  const { isAssignModalOpen, assignTargetProxy, setAssignModalOpen, assignProxy } =
    useProxyVaultStore();
  const { profiles, loadProfiles } = useProfilesStore();

  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isAssignModalOpen || !assignTargetProxy) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProfileId) {
      setErrorMsg('Please select a profile to bind this proxy to');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await assignProxy(selectedProfileId, assignTargetProxy.id);
      await loadProfiles();
      setAssignModalOpen(false, null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to bind proxy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
      onClick={() => setAssignModalOpen(false, null)}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-card-highlight)',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
              }}
            >
              <LinkIcon size={14} />
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Bind Proxy to Profile
            </h2>
          </div>
          <button
            onClick={() => setAssignModalOpen(false, null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-danger-bg)',
                border: '1px solid var(--color-danger-border)',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Target Proxy Card Preview */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600 }}>
                Target Proxy
              </span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                {assignTargetProxy.protocol.toUpperCase()}://{assignTargetProxy.host}:{assignTargetProxy.port}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {assignTargetProxy.geoCity ? `${assignTargetProxy.geoCity}, ` : ''}{assignTargetProxy.geoCountry ?? 'Unknown Location'}
              </div>
            </div>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'capitalize',
                background:
                  assignTargetProxy.status === 'healthy'
                    ? 'var(--color-success-bg)'
                    : 'var(--color-warning-bg)',
                color:
                  assignTargetProxy.status === 'healthy'
                    ? 'var(--color-success)'
                    : 'var(--color-warning)',
              }}
            >
              {assignTargetProxy.status}
            </span>
          </div>

          {/* Target Profile Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Select Profile
            </label>
            {profiles.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '8px 0' }}>
                No browser profiles found. Create a profile in Profile Studio first.
              </div>
            ) : (
              <select
                className="input"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                required
                style={{ width: '100%', fontSize: '13px' }}
              >
                <option value="">-- Choose Profile --</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.platform.toUpperCase()} · {p.state}) {p.proxyId ? '[Has Bound Proxy]' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>
            Note: If the selected profile already holds a lease, it will be automatically replaced with this proxy.
          </p>

          {/* Footer Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAssignModalOpen(false, null)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !selectedProfileId}
            >
              {submitting ? 'Binding...' : 'Bind Proxy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
