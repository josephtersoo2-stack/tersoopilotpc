import { useState } from 'react';

import { PlusIcon, XIcon } from '../../components/icons';
import { useTasksStore } from '../../stores/tasksStore';

export function WorkflowVariablesBar() {
  const { currentWorkflow, setWorkflowVariable, removeWorkflowVariable } = useTasksStore();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const variables = currentWorkflow.variables || {};
  const variableEntries = Object.entries(variables);

  // Discover variables that will be populated dynamically by 'extract' steps
  const extractedVars = currentWorkflow.steps
    .filter((s) => s.type === 'extract')
    .map((s) => (s as { as: string }).as);

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    setWorkflowVariable(key, newValue.trim());
    setNewKey('');
    setNewValue('');
    setIsAdding(false);
  };

  return (
    <div
      style={{
        padding: '10px 24px',
        background: '#0d131f',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '12px',
      }}
    >
      <span
        style={{
          color: 'var(--text-dim)',
          fontWeight: 600,
          textTransform: 'uppercase',
          fontSize: '10px',
          letterSpacing: '0.05em',
          marginRight: '4px',
        }}
      >
        Variables (&#123;&#123;var&#125;&#125;):
      </span>

      {/* Initial variables pills */}
      {variableEntries.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
            gap: '6px',
            color: '#93c5fd',
          }}
        >
          <span style={{ fontWeight: 600 }}>{k}:</span>
          <span
            style={{
              color: 'var(--text-main)',
              maxWidth: '180px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={String(v)}
          >
            "{String(v)}"
          </span>
          <button
            onClick={() => removeWorkflowVariable(k)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Delete variable"
          >
            <XIcon size={12} />
          </button>
        </div>
      ))}

      {/* Extracted variables pills (runtime outputs) */}
      {extractedVars.map((v) => (
        <div
          key={`extracted-${v}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
            gap: '6px',
            color: '#c4b5fd',
          }}
          title="Extracted dynamically during workflow execution"
        >
          <span style={{ fontWeight: 600 }}>{v}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>(extracted)</span>
        </div>
      ))}

      {/* Add Variable inline input */}
      {isAdding ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="text"
            placeholder="key (e.g. baseUrl)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-card-highlight)',
              color: '#fff',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              width: '110px',
              outline: 'none',
            }}
            autoFocus
          />
          <input
            type="text"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setIsAdding(false);
            }}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-card-highlight)',
              color: '#fff',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              width: '140px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              background: '#3b82f6',
              border: 'none',
              color: '#fff',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Add
          </button>
          <button
            onClick={() => setIsAdding(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          style={{
            background: 'transparent',
            border: '1px dashed var(--border-card)',
            color: 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.color = '#93c5fd';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-card)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <PlusIcon size={11} />
          <span>Add Variable</span>
        </button>
      )}
    </div>
  );
}
