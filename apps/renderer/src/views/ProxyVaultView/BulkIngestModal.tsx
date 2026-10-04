import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { ImportReport } from '@tersoo/contracts';

import { CheckIcon, UploadIcon, XIcon } from '../../components/icons';
import { useProxyVaultStore } from '../../stores/proxyVaultStore';

export function BulkIngestModal() {
  const { isBulkImportModalOpen, setBulkImportModalOpen, importBulk } = useProxyVaultStore();

  const [text, setText] = useState('');
  const [format, setFormat] = useState<'auto' | 'ip:port:user:pass' | 'url' | 'ip:port'>('auto');
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isBulkImportModalOpen) return null;

  const lineCount = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//')).length;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setErrorMsg('Please enter or upload at least one proxy line');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await importBulk({
        text,
        format,
      });
      setReport(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setText('');
    setReport(null);
    setErrorMsg(null);
    setBulkImportModalOpen(false);
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
      onClick={handleClose}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '580px',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-card-highlight)',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
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
              Bulk Proxy Ingestion
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Import hundreds of proxy endpoints in seconds. Duplicates are auto-skipped.
            </p>
          </div>
          <button
            onClick={handleClose}
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

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

          {/* If report is present, show report summary */}
          {report ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid var(--color-success-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--color-success-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-success)',
                  }}
                >
                  <CheckIcon size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Bulk Ingestion Complete
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Successfully imported into the vault with credentials isolated.
                  </div>
                </div>
              </div>

              {/* Stats Breakdown */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                }}
              >
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Parsed</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                    {report.parsed}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Imported</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)', fontFamily: 'monospace' }}>
                    {report.imported}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Skipped (Dups)</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-warning)', fontFamily: 'monospace' }}>
                    {report.skipped}
                  </div>
                </div>
              </div>

              {/* Errors List if any */}
              {report.errors.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5', marginBottom: '6px' }}>
                    Unparsable Lines ({report.errors.length}):
                  </div>
                  <div
                    style={{
                      maxHeight: '120px',
                      overflowY: 'auto',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: '#fca5a5',
                    }}
                  >
                    {report.errors.map((err, idx) => (
                      <div key={idx}>
                        Line {err.line}: {err.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn btn-primary" onClick={handleClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { void handleImport(e); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Format & File Upload Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Format:</label>
                  <select
                    className="input"
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                    value={format}
                    onChange={(e) => setFormat(e.target.value as typeof format)}
                  >
                    <option value="auto">Auto-Detect</option>
                    <option value="ip:port:user:pass">IP:Port:User:Pass</option>
                    <option value="url">URL (protocol://user:pass@host:port)</option>
                    <option value="ip:port">IP:Port (No Auth)</option>
                  </select>
                </div>

                <div>
                  <label className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
                    <UploadIcon size={12} />
                    <span>Upload File</span>
                    <input type="file" accept=".txt,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              {/* Textarea */}
              <div>
                <textarea
                  className="input"
                  rows={8}
                  placeholder={`Paste proxies line by line. Supported formats:\n198.51.100.1:1080:user:pass\nsocks5://user:pass@198.51.100.1:1080\nhttp://198.51.100.2:8080\n198.51.100.3:3128`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: 'var(--text-dim)' }}>
                  <span>Delimiters supported: Colon (:), Tab, Comma, Pipe (|)</span>
                  <span>{lineCount} valid line{lineCount === 1 ? '' : 's'}</span>
                </div>
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || lineCount === 0}>
                  {submitting ? 'Ingesting...' : `Import ${lineCount > 0 ? lineCount : ''} Proxies`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
