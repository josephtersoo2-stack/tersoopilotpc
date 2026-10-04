import { useState, type FormEvent } from 'react';

import { XIcon } from '../../components/icons';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

export function AddProxyModal() {
  const { isAddModalOpen, setAddModalOpen, createProxy } = useProxyVaultStore();

  const [protocol, setProtocol] = useState<'socks5' | 'http' | 'https'>('socks5');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(1080);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isAddModalOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!host.trim()) {
      setErrorMsg('Host or IP address is required');
      return;
    }

    if (!port || port < 1 || port > 65535) {
      setErrorMsg('Port must be a number between 1 and 65535');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await createProxy({
        protocol,
        host: host.trim(),
        port,
        username: username.trim() || undefined,
        password: password || undefined,
      });

      // Reset form
      setHost('');
      setPort(protocol === 'socks5' ? 1080 : 8080);
      setUsername('');
      setPassword('');
      setAddModalOpen(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save proxy');
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
      onClick={() => setAddModalOpen(false)}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-card-highlight)',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Add Proxy Endpoint
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Credentials are encrypted and stored in SecretVault.
            </p>
          </div>
          <button
            onClick={() => setAddModalOpen(false)}
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

        {/* Modal Form */}
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

          {/* Protocol Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Protocol
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['socks5', 'http', 'https'] as const).map((proto) => (
                <button
                  type="button"
                  key={proto}
                  onClick={() => {
                    setProtocol(proto);
                    if (port === 1080 || port === 8080) {
                      setPort(proto === 'socks5' ? 1080 : 8080);
                    }
                  }}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-md)',
                    border: protocol === proto ? '1px solid var(--color-primary)' : '1px solid var(--border-card)',
                    background: protocol === proto ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-input)',
                    color: protocol === proto ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {proto}
                </button>
              ))}
            </div>
          </div>

          {/* Host & Port */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Host / IP Address
              </label>
              <input
                type="text"
                className="input"
                placeholder="198.51.100.1 or proxy.example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Port
              </label>
              <input
                type="number"
                className="input"
                value={port}
                min={1}
                max={65535}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 0)}
                required
                style={{ width: '100%', fontSize: '13px', fontFamily: 'monospace' }}
              />
            </div>
          </div>

          {/* Authentication (Optional) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Username (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="user123"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Password (Optional)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', fontSize: '13px', paddingRight: '48px' }}
                />
                {password && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAddModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add to Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
