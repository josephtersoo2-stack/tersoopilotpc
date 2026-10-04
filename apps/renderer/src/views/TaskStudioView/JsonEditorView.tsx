import { useState } from 'react';

import { CheckIcon, CopyIcon } from '../../components/icons';
import { useTasksStore } from '../../stores/tasksStore';

export function JsonEditorView() {
  const { jsonContent, updateJsonContent, validationErrors } = useTasksStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(jsonContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(jsonContent) as unknown;
      updateJsonContent(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '12px',
        padding: '20px 24px',
      }}
    >
      {/* Editor Controls Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Workflow Schema v1 JSON Definition (live synced with visual builder)
        </span>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handlePrettify}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-card)',
              color: 'var(--text-main)',
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Format JSON
          </button>

          <button
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-card)',
              color: 'var(--text-main)',
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Code Textarea */}
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          data-testid="workflow-json-editor"
          value={jsonContent}
          onChange={(e) => updateJsonContent(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            height: '100%',
            minHeight: '400px',
            background: '#070b12',
            border: validationErrors.length > 0 ? '1px solid rgba(244, 63, 94, 0.5)' : '1px solid var(--border-card)',
            borderRadius: 'var(--radius-md)',
            color: '#e2e8f0',
            fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '16px',
            resize: 'none',
            outline: 'none',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* Validation Issue Banner */}
      {validationErrors.length > 0 && (
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e' }}>
            Validation Issues ({validationErrors.length})
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {validationErrors.map((err, idx) => (
              <span key={idx} style={{ fontSize: '11px', color: '#fca5a5' }}>
                • {err}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
