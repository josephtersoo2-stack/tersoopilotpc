import { useState } from 'react';

import { CheckIcon, CopyIcon, DownloadIcon, UploadIcon, XIcon } from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';

export function ImportExportModal() {
  const { isImportModalOpen, closeImportModal, exportProfilesJson, importProfilesJson, selectedIds } =
    useProfilesStore();

  const [mode, setMode] = useState<'import' | 'export'>('export');
  const [importJson, setImportJson] = useState('');
  const [copied, setCopied] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isImportModalOpen) return null;

  const exportText = exportProfilesJson();

  const handleCopy = () => {
    void navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tersoopilot-profiles-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = async () => {
    setError(null);
    try {
      const count = await importProfilesJson(importJson);
      setImportCount(count);
      setTimeout(() => {
        closeImportModal();
        setImportCount(null);
        setImportJson('');
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid JSON format');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={closeImportModal}
    >
      <div
        className="glass-panel animate-scale-in"
        style={{
          width: '580px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d131f',
          border: '1px solid var(--border-card-highlight)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setMode('export')}
              style={{
                background: mode === 'export' ? 'var(--color-primary)' : 'transparent',
                color: mode === 'export' ? '#ffffff' : 'var(--text-dim)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Export Profiles
            </button>
            <button
              onClick={() => setMode('import')}
              style={{
                background: mode === 'import' ? 'var(--color-primary)' : 'transparent',
                color: mode === 'import' ? '#ffffff' : 'var(--text-dim)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Import Profiles
            </button>
          </div>
          <button className="btn-icon" onClick={closeImportModal}>
            <XIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ color: '#f43f5e', fontSize: '12px', padding: '8px 12px', background: 'rgba(244, 63, 94, 0.1)', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {importCount !== null && (
            <div style={{ color: '#10b981', fontSize: '12px', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
              Successfully imported {importCount} profile{importCount > 1 ? 's' : ''}!
            </div>
          )}

          {mode === 'export' ? (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {selectedIds.size > 0
                  ? `Exporting ${selectedIds.size} selected profile(s) as JSON configuration.`
                  : 'Exporting all fleet profiles as JSON configuration.'}
              </div>
              <textarea
                className="input"
                readOnly
                value={exportText}
                rows={10}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', resize: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-secondary" onClick={handleCopy}>
                  {copied ? <CheckIcon size={12} color="#10b981" /> : <CopyIcon size={12} />}
                  <span>{copied ? 'Copied to Clipboard' : 'Copy JSON'}</span>
                </button>
                <button className="btn btn-primary" onClick={handleDownload}>
                  <DownloadIcon size={12} />
                  <span>Download File (.json)</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Paste JSON profile data or array of profiles to import:
              </div>
              <textarea
                className="input"
                placeholder='[ { "name": "Imported Profile", "presetId": "00000000-0000-4000-8000-000000000001", "tags": ["imported"] } ]'
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                rows={10}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', resize: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-secondary" onClick={closeImportModal}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    void handleImportSubmit();
                  }}
                  disabled={!importJson.trim()}
                >
                  <UploadIcon size={12} />
                  <span>Import Profiles</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
