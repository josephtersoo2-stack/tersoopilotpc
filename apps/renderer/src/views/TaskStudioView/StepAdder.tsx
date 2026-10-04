import type { Step } from '@tersoo/contracts';

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  CameraIcon,
  ClockIcon,
  CpuIcon,
  FileTextIcon,
  GlobeIcon,
  MousePointerIcon,
  PlusIcon,
  TypeIcon,
} from '../../components/icons';
import { useTasksStore } from '../../stores/tasksStore';

export function StepAdder() {
  const { addStep } = useTasksStore();

  const stepButtons: Array<{
    type: Step['type'];
    label: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    { type: 'navigate', label: 'Navigate', icon: <GlobeIcon size={13} />, color: '#60a5fa' },
    { type: 'waitFor', label: 'Wait For', icon: <ClockIcon size={13} />, color: '#fbbf24' },
    { type: 'click', label: 'Click', icon: <MousePointerIcon size={13} />, color: '#34d399' },
    { type: 'type', label: 'Type', icon: <TypeIcon size={13} />, color: '#a78bfa' },
    { type: 'scroll', label: 'Scroll', icon: <ArrowDownIcon size={13} />, color: '#22d3ee' },
    { type: 'goBack', label: 'Go Back', icon: <ArrowLeftIcon size={13} />, color: '#38bdf8' },
    { type: 'engage', label: 'Engage', icon: <MousePointerIcon size={13} />, color: '#fb7185' },
    { type: 'extract', label: 'Extract', icon: <FileTextIcon size={13} />, color: '#f472b6' },
    { type: 'screenshot', label: 'Screenshot', icon: <CameraIcon size={13} />, color: '#fde047' },
    { type: 'llm', label: 'LLM Goal', icon: <CpuIcon size={13} />, color: '#c084fc' },
    { type: 'sleep', label: 'Sleep', icon: <ClockIcon size={13} />, color: '#cbd5e1' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '16px',
        border: '1px dashed var(--border-card)',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(15, 22, 36, 0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <PlusIcon size={12} />
        <span>Add Next Automation Step</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {stepButtons.map((btn) => (
          <button
            key={btn.type}
            data-testid={`add-step-${btn.type}`}
            onClick={() => addStep(btn.type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-card)',
              color: btn.color,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = btn.color;
              e.currentTarget.style.boxShadow = `0 0 10px ${btn.color}33`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.borderColor = 'var(--border-card)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {btn.icon}
            <span>{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
