import { useState } from 'react';
import type { CopilotActionProposed } from '@tersoo/contracts';
import { useCopilotStore } from '../../stores/copilotStore';
import { BoltIcon, CheckIcon, ChevronDownIcon, PlayIcon } from '../icons';

interface CopilotActionCardProps {
  action: CopilotActionProposed;
  onNavigate?: ((view: string) => void) | undefined;
}

export function CopilotActionCard({ action, onNavigate }: CopilotActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [localExecuted, setLocalExecuted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const executeAction = useCopilotStore((s) => s.executeAction);

  const isExecuted = action.status === 'executed' || localExecuted;
  const isRejected = action.status === 'rejected';

  const handleExecute = async () => {
    if (executing || isExecuted) return;
    setExecuting(true);
    setFeedback(null);
    try {
      const res = await executeAction(action);
      setFeedback(res.message);
      if (res.success) {
        setLocalExecuted(true);
        if (res.view && onNavigate) {
          onNavigate(res.view);
        }
      }
    } catch (err: any) {
      setFeedback(err?.message || String(err));
    } finally {
      setExecuting(false);
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case 'create_profile':
      case 'bulk_create_profiles':
        return 'rgba(59, 130, 246, 0.15) text-blue-400 border-blue-500/30';
      case 'launch_profile':
        return 'rgba(34, 197, 94, 0.15) text-emerald-400 border-emerald-500/30';
      case 'stop_profile':
      case 'stop_run':
        return 'rgba(239, 68, 68, 0.15) text-rose-400 border-rose-500/30';
      case 'create_task':
        return 'rgba(168, 85, 247, 0.15) text-purple-400 border-purple-500/30';
      case 'create_niche':
        return 'rgba(16, 185, 129, 0.15) text-emerald-400 border-emerald-500/30';
      case 'dispatch_run':
        return 'rgba(245, 158, 11, 0.15) text-amber-400 border-amber-500/30';
      case 'create_template':
      case 'update_template':
        return 'rgba(14, 165, 233, 0.15) text-cyan-400 border-cyan-500/30';
      case 'delete_template':
        return 'rgba(239, 68, 68, 0.15) text-rose-400 border-rose-500/30';
      case 'instantiate_template':
        return 'rgba(236, 72, 153, 0.15) text-pink-400 border-pink-500/30';
      default:
        return 'rgba(100, 116, 139, 0.15) text-slate-300 border-slate-600/30';
    }
  };

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '12px 14px',
        borderRadius: '10px',
        backgroundColor: '#131b2e',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: '#60a5fa',
            }}
          >
            {action.type.replace(/_/g, ' ')}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>{action.title}</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          title={expanded ? 'Collapse payload' : 'Inspect payload'}
        >
          <ChevronDownIcon size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {action.description && (
        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
          {action.description}
        </p>
      )}

      {expanded && (
        <pre
          style={{
            margin: '0 0 10px 0',
            padding: '8px 10px',
            borderRadius: '6px',
            backgroundColor: '#0a0f1d',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '11px',
            color: '#38bdf8',
            maxHeight: '160px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      )}

      {feedback && (
        <div
          style={{
            margin: '0 0 8px 0',
            fontSize: '12px',
            color: isExecuted ? '#4ade80' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {isExecuted ? <CheckIcon size={14} /> : '⚠️'}
          <span>{feedback}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isExecuted ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4ade80',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.25)',
            }}
          >
            <CheckIcon size={14} />
            <span>Executed Successfully</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleExecute}
            disabled={executing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              padding: '7px 14px',
              borderRadius: '6px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              cursor: executing ? 'not-allowed' : 'pointer',
              opacity: executing ? 0.7 : 1,
              transition: 'background-color 0.15s',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
            }}
          >
            {executing ? (
              <span>Executing...</span>
            ) : (
              <>
                <BoltIcon size={14} />
                <span>Confirm & Apply</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
