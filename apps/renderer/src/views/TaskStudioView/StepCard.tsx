import type { Step } from '@tersoo/contracts';

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CameraIcon,
  ClockIcon,
  DuplicateIcon,
  FileTextIcon,
  GlobeIcon,
  MousePointerIcon,
  TrashIcon,
  TypeIcon,
} from '../../components/icons';
import { useTasksStore } from '../../stores/tasksStore';

interface StepCardProps {
  index: number;
  step: Step;
  totalSteps: number;
}

export function StepCard({ index, step, totalSteps }: StepCardProps) {
  const { updateStep, removeStep, moveStep, addStep } = useTasksStore();

  const handleTypeChange = (newType: Step['type']) => {
    if (newType === step.type) return;
    switch (newType) {
      case 'navigate':
        updateStep(index, { type: 'navigate', url: 'https://example.com', waitUntil: 'domcontentloaded' });
        break;
      case 'waitFor':
        updateStep(index, { type: 'waitFor', selector: 'body', timeoutMs: 15000 });
        break;
      case 'waitForUrl':
        updateStep(index, { type: 'waitForUrl', url: 'https://example.com', timeoutMs: 15000 });
        break;
      case 'click':
        updateStep(index, { type: 'click', selector: 'button', humanized: true });
        break;
      case 'hover':
        updateStep(index, { type: 'hover', selector: 'button', humanized: true });
        break;
      case 'mouseMove':
        updateStep(index, { type: 'mouseMove', selector: 'button', humanized: true });
        break;
      case 'type':
        updateStep(index, { type: 'type', selector: 'input', text: 'Text', humanized: true });
        break;
      case 'scroll':
        updateStep(index, { type: 'scroll', direction: 'down', amount: 400, kinetic: true });
        break;
      case 'extract':
        updateStep(index, { type: 'extract', selector: 'h1', as: 'extractedVar' });
        break;
      case 'screenshot':
        updateStep(index, { type: 'screenshot', name: `screenshot-${index + 1}` });
        break;
      case 'sleep':
        updateStep(index, { type: 'sleep', minMs: 1000, maxMs: 2500 });
        break;
      case 'llm':
        updateStep(index, { type: 'llm', goal: 'Complete goal with AI', maxIterations: 10 });
        break;
      case 'engage':
        updateStep(index, { type: 'engage', action: 'like', optional: true });
        break;
      case 'goBack':
        updateStep(index, { type: 'goBack', timeoutMs: 30000 });
        break;
      case 'repeat':
        updateStep(index, {
          type: 'repeat',
          times: 2,
          label: 'Loop',
          continueOnError: false,
          steps: [{ type: 'sleep', minMs: 1000, maxMs: 2000 }],
        });
        break;
    }
  };

  const getStepIcon = (type: Step['type']) => {
    switch (type) {
      case 'navigate':
        return <GlobeIcon size={14} color="#60a5fa" />;
      case 'waitFor':
        return <ClockIcon size={14} color="#f59e0b" />;
      case 'waitForUrl':
        return <GlobeIcon size={14} color="#38bdf8" />;
      case 'click':
        return <MousePointerIcon size={14} color="#10b981" />;
      case 'hover':
        return <MousePointerIcon size={14} color="#c084fc" />;
      case 'mouseMove':
        return <MousePointerIcon size={14} color="#2dd4bf" />;
      case 'type':
        return <TypeIcon size={14} color="#8b5cf6" />;
      case 'scroll':
        return <ArrowDownIcon size={14} color="#06b6d4" />;
      case 'extract':
        return <FileTextIcon size={14} color="#ec4899" />;
      case 'screenshot':
        return <CameraIcon size={14} color="#eab308" />;
      case 'sleep':
        return <ClockIcon size={14} color="#94a3b8" />;
      case 'llm':
        return <FileTextIcon size={14} color="#f97316" />;
      case 'engage':
        return <MousePointerIcon size={14} color="#f43f5e" />;
      case 'goBack':
        return <ArrowLeftIcon size={14} color="#38bdf8" />;
      case 'repeat':
        return <DuplicateIcon size={14} color="#c084fc" />;
      default:
        return <GlobeIcon size={14} color="#60a5fa" />;
    }
  };

  const getTypeColor = (type: Step['type']) => {
    switch (type) {
      case 'navigate':
        return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: '#60a5fa' };
      case 'waitFor':
        return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24' };
      case 'waitForUrl':
        return { bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', text: '#38bdf8' };
      case 'click':
        return { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: '#34d399' };
      case 'hover':
        return { bg: 'rgba(192, 132, 252, 0.12)', border: 'rgba(192, 132, 252, 0.3)', text: '#c084fc' };
      case 'mouseMove':
        return { bg: 'rgba(45, 212, 191, 0.12)', border: 'rgba(45, 212, 191, 0.3)', text: '#2dd4bf' };
      case 'type':
        return { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)', text: '#a78bfa' };
      case 'scroll':
        return { bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.3)', text: '#22d3ee' };
      case 'extract':
        return { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)', text: '#f472b6' };
      case 'screenshot':
        return { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.3)', text: '#fde047' };
      case 'sleep':
        return { bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)', text: '#cbd5e1' };
      case 'llm':
        return { bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.3)', text: '#fb923c' };
      case 'engage':
        return { bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)', text: '#fb7185' };
      case 'goBack':
        return { bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', text: '#38bdf8' };
      case 'repeat':
        return { bg: 'rgba(192, 132, 252, 0.12)', border: 'rgba(192, 132, 252, 0.3)', text: '#c084fc' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: '#60a5fa' };
    }
  };

  const styleColors = getTypeColor(step.type);

  return (
    <div
      style={{
        background: '#0f1624',
        border: '1px solid var(--border-card)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-card)';
      }}
    >
      {/* Top Header of Step */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Index bubble */}
          <span
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {index + 1}
          </span>

          {/* Type Select Dropdown */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: styleColors.bg,
              border: `1px solid ${styleColors.border}`,
              borderRadius: 'var(--radius-md)',
              padding: '4px 8px',
            }}
          >
            {getStepIcon(step.type)}
            <select
              value={step.type}
              onChange={(e) => handleTypeChange(e.target.value as Step['type'])}
              style={{
                background: 'transparent',
                border: 'none',
                color: styleColors.text,
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <option value="navigate" style={{ background: '#0f1624', color: '#fff' }}>Navigate</option>
              <option value="waitFor" style={{ background: '#0f1624', color: '#fff' }}>Wait For Element</option>
              <option value="waitForUrl" style={{ background: '#0f1624', color: '#fff' }}>Wait For URL</option>
              <option value="click" style={{ background: '#0f1624', color: '#fff' }}>Click</option>
              <option value="hover" style={{ background: '#0f1624', color: '#fff' }}>Hover</option>
              <option value="mouseMove" style={{ background: '#0f1624', color: '#fff' }}>Mouse Move</option>
              <option value="type" style={{ background: '#0f1624', color: '#fff' }}>Type</option>
              <option value="scroll" style={{ background: '#0f1624', color: '#fff' }}>Scroll</option>
              <option value="extract" style={{ background: '#0f1624', color: '#fff' }}>Extract</option>
              <option value="screenshot" style={{ background: '#0f1624', color: '#fff' }}>Screenshot</option>
              <option value="sleep" style={{ background: '#0f1624', color: '#fff' }}>Sleep / Dwell</option>
              <option value="llm" style={{ background: '#0f1624', color: '#fff' }}>AI / LLM</option>
              <option value="engage" style={{ background: '#0f1624', color: '#fff' }}>Engage (Like, Comment, Subscribe, Ad-Skip)</option>
              <option value="goBack" style={{ background: '#0f1624', color: '#fff' }}>Go Back (Browser Back)</option>
              <option value="repeat" style={{ background: '#0f1624', color: '#fff' }}>Repeat Loop (N Iterations)</option>
            </select>
          </div>
        </div>

        {/* Step Controls: Up, Down, Duplicate, Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => moveStep(index, index - 1)}
            disabled={index === 0}
            title="Move step up"
            style={{
              background: 'transparent',
              border: 'none',
              color: index === 0 ? 'rgba(255,255,255,0.1)' : 'var(--text-muted)',
              cursor: index === 0 ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowUpIcon size={14} />
          </button>

          <button
            onClick={() => moveStep(index, index + 1)}
            disabled={index === totalSteps - 1}
            title="Move step down"
            style={{
              background: 'transparent',
              border: 'none',
              color: index === totalSteps - 1 ? 'rgba(255,255,255,0.1)' : 'var(--text-muted)',
              cursor: index === totalSteps - 1 ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowDownIcon size={14} />
          </button>

          <button
            onClick={() => {
              addStep(step.type);
            }}
            title="Duplicate step"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <DuplicateIcon size={14} />
          </button>

          <button
            onClick={() => removeStep(index)}
            disabled={totalSteps <= 1}
            title="Delete step"
            style={{
              background: 'transparent',
              border: 'none',
              color: totalSteps <= 1 ? 'rgba(255,255,255,0.1)' : '#f43f5e',
              cursor: totalSteps <= 1 ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {/* Body: Step-Specific Parameter Fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        {/* NAVIGATE */}
        {step.type === 'navigate' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>URL</label>
              <input
                type="text"
                value={step.url}
                onChange={(e) => updateStep(index, { ...step, url: e.target.value })}
                placeholder="https://example.com or {{baseUrl}}"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '200px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Wait Until</label>
              <select
                value={step.waitUntil ?? 'domcontentloaded'}
                onChange={(e) =>
                  updateStep(index, {
                    ...step,
                    waitUntil: e.target.value as 'load' | 'domcontentloaded' | 'networkidle',
                  })
                }
                style={selectStyle}
              >
                <option value="domcontentloaded">DOMContentLoaded</option>
                <option value="load">Load (All Assets)</option>
                <option value="networkidle">Network Idle</option>
              </select>
            </div>
          </>
        )}

        {/* WAIT FOR */}
        {step.type === 'waitFor' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Selector / XPath</label>
              <input
                type="text"
                value={step.selector}
                onChange={(e) => updateStep(index, { ...step, selector: e.target.value })}
                placeholder="#submit-btn or //button[text()='Login']"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '160px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Timeout (ms)</label>
              <input
                type="number"
                value={step.timeoutMs ?? 15000}
                onChange={(e) => updateStep(index, { ...step, timeoutMs: Number(e.target.value) })}
                step={1000}
                min={100}
                max={120000}
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* WAIT FOR URL */}
        {step.type === 'waitForUrl' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>URL / Substring Pattern</label>
              <input
                type="text"
                value={step.url}
                onChange={(e) => updateStep(index, { ...step, url: e.target.value })}
                placeholder="youtube.com or https://example.com/feed"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '160px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Timeout (ms)</label>
              <input
                type="number"
                value={step.timeoutMs ?? 15000}
                onChange={(e) => updateStep(index, { ...step, timeoutMs: Number(e.target.value) })}
                step={1000}
                min={100}
                max={120000}
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* CLICK */}
        {step.type === 'click' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Selector / XPath</label>
              <input
                type="text"
                value={step.selector}
                onChange={(e) => updateStep(index, { ...step, selector: e.target.value })}
                placeholder="button.primary or //div[@role='button']"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={step.humanized ?? true}
                  onChange={(e) => updateStep(index, { ...step, humanized: e.target.checked })}
                />
                <span style={{ color: '#34d399', fontWeight: 600 }}>Humanized Bézier Mouse</span>
              </label>
            </div>
          </>
        )}

        {/* HOVER */}
        {step.type === 'hover' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Selector / XPath</label>
              <input
                type="text"
                value={step.selector}
                onChange={(e) => updateStep(index, { ...step, selector: e.target.value })}
                placeholder="#player, button.settings, or //div[@id='movie_player']"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={step.humanized ?? true}
                  onChange={(e) => updateStep(index, { ...step, humanized: e.target.checked })}
                />
                <span style={{ color: '#c084fc', fontWeight: 600 }}>Humanized Bézier Glide</span>
              </label>
            </div>
          </>
        )}

        {/* MOUSE MOVE */}
        {step.type === 'mouseMove' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Target Selector / XPath (Optional)</label>
              <input
                type="text"
                value={step.selector ?? ''}
                onChange={(e) => updateStep(index, { ...step, selector: e.target.value || undefined })}
                placeholder="#player, .ytp-play-button (or leave blank for natural wander)"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={step.humanized ?? true}
                  onChange={(e) => updateStep(index, { ...step, humanized: e.target.checked })}
                />
                <span style={{ color: '#2dd4bf', fontWeight: 600 }}>Humanized Bézier Trajectory</span>
              </label>
            </div>
          </>
        )}

        {/* TYPE */}
        {step.type === 'type' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Selector / XPath</label>
              <input
                type="text"
                value={step.selector}
                onChange={(e) => updateStep(index, { ...step, selector: e.target.value })}
                placeholder="input[name='query']"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Text to Type (Supports &#123;&#123;var&#125;&#125;)</label>
              <input
                type="text"
                value={step.text}
                onChange={(e) => updateStep(index, { ...step, text: e.target.value })}
                placeholder="Hello World"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={step.humanized ?? true}
                  onChange={(e) => updateStep(index, { ...step, humanized: e.target.checked })}
                />
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>Humanized Typing</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={Boolean((step as any).pressEnter)}
                  onChange={(e) => updateStep(index, { ...step, pressEnter: e.target.checked } as any)}
                />
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>Press Enter After Typing</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={Boolean((step as any).clearFirst)}
                  onChange={(e) => updateStep(index, { ...step, clearFirst: e.target.checked } as any)}
                />
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>Clear First (Ctrl+A & Backspace)</span>
              </label>
            </div>
          </>
        )}

        {/* SCROLL */}
        {step.type === 'scroll' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '140px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Direction</label>
              <select
                value={step.direction}
                onChange={(e) => updateStep(index, { ...step, direction: e.target.value as 'up' | 'down' })}
                style={selectStyle}
              >
                <option value="down">Down</option>
                <option value="up">Up</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '160px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Amount (px)</label>
              <input
                type="number"
                value={step.amount}
                onChange={(e) => updateStep(index, { ...step, amount: Math.max(1, Number(e.target.value)) })}
                step={100}
                min={1}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={step.kinetic ?? true}
                  onChange={(e) => updateStep(index, { ...step, kinetic: e.target.checked })}
                />
                <span style={{ color: '#22d3ee', fontWeight: 600 }}>Kinetic Inertial Bursts</span>
              </label>
            </div>
          </>
        )}

        {/* EXTRACT */}
        {step.type === 'extract' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Selector / XPath</label>
              <input
                type="text"
                value={step.selector}
                onChange={(e) => updateStep(index, { ...step, selector: e.target.value })}
                placeholder="h1.product-title"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Store As Variable</label>
              <input
                type="text"
                value={step.as}
                onChange={(e) => updateStep(index, { ...step, as: e.target.value })}
                placeholder="extractedTitle"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Attribute (Optional)</label>
              <input
                type="text"
                value={step.attribute ?? ''}
                onChange={(e) =>
                  updateStep(index, {
                    ...step,
                    ...(e.target.value.trim() ? { attribute: e.target.value.trim() } : { attribute: undefined }),
                  })
                }
                placeholder="href, src (leave blank for textContent)"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* SCREENSHOT */}
        {step.type === 'screenshot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Screenshot Name</label>
            <input
              type="text"
              value={step.name}
              onChange={(e) => updateStep(index, { ...step, name: e.target.value })}
              placeholder="e.g. anti-bot-results"
              style={inputStyle}
            />
          </div>
        )}

        {/* SLEEP */}
        {step.type === 'sleep' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '160px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Min Duration (ms)</label>
              <input
                type="number"
                value={step.minMs}
                onChange={(e) => updateStep(index, { ...step, minMs: Math.max(0, Number(e.target.value)) })}
                step={500}
                min={0}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '160px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Max Duration (ms)</label>
              <input
                type="number"
                value={step.maxMs}
                onChange={(e) => updateStep(index, { ...step, maxMs: Math.max(step.minMs, Number(e.target.value)) })}
                step={500}
                min={step.minMs}
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* LLM */}
        {step.type === 'llm' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>AI Goal</label>
              <input
                type="text"
                value={step.goal}
                onChange={(e) => updateStep(index, { ...step, goal: e.target.value })}
                placeholder="e.g. Find and click the Checkout button"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '140px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Max Iterations</label>
              <input
                type="number"
                value={step.maxIterations ?? 10}
                onChange={(e) => updateStep(index, { ...step, maxIterations: Math.max(1, Number(e.target.value)) })}
                min={1}
                max={50}
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Repeat (run a nested step list N times) */}
        {step.type === 'repeat' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                Loop Label
              </label>
              <input
                type="text"
                value={step.label ?? ''}
                onChange={(e) => updateStep(index, { ...step, label: e.target.value })}
                placeholder="e.g. SERP cycle"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '150px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
                Repeat (or {'{{variable}}'})
              </label>
              <input
                type="text"
                value={String(step.times)}
                onChange={(e) => updateStep(index, { ...step, times: e.target.value })}
                placeholder="3"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '11px',
                color: 'var(--text-dim)',
                minWidth: '96px',
              }}
            >
              <span style={{ fontWeight: 600 }}>Body</span>
              <span>{step.steps.length} nested step(s)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '18px' }}>
              <input
                type="checkbox"
                id={`repeat-continue-${index}`}
                checked={step.continueOnError === true}
                onChange={(e) => updateStep(index, { ...step, continueOnError: e.target.checked })}
              />
              <label
                htmlFor={`repeat-continue-${index}`}
                style={{ fontSize: '12px', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                Continue on error
              </label>
            </div>
          </>
        )}

        {/* Engage (Like, Dislike, Subscribe, Comment, Skip Ad, Share, Save, Bell) */}
        {step.type === 'engage' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Action</label>
              <select
                value={step.action}
                onChange={(e) => updateStep(index, { ...step, action: e.target.value as any })}
                style={selectStyle}
              >
                <option value="like">Like Video / Post</option>
                <option value="dislike">Dislike Video</option>
                <option value="subscribe">Subscribe to Channel</option>
                <option value="unsubscribe">Unsubscribe</option>
                <option value="comment">Post Comment</option>
                <option value="skip_ad">Skip Video Ad</option>
                <option value="share">Click Share</option>
                <option value="save">Save to Playlist</option>
                <option value="bell">Toggle Notification Bell</option>
              </select>
            </div>

            {step.action === 'comment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Comment Text (Supports variables)</label>
                <input
                  type="text"
                  value={step.commentText ?? ''}
                  onChange={(e) => updateStep(index, { ...step, commentText: e.target.value })}
                  placeholder="e.g. Great video! {{customComment}}"
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '18px' }}>
              <input
                type="checkbox"
                id={`engage-optional-${index}`}
                checked={step.optional !== false}
                onChange={(e) => updateStep(index, { ...step, optional: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor={`engage-optional-${index}`} style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Optional (gracefully continue if not logged in)
              </label>
            </div>
          </>
        )}

        {/* GO BACK */}
        {step.type === 'goBack' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 2' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Simulates authentic browser back button navigation (<code>history.back()</code>) with humanized cursor drift, settling delay, and automatic consent popup checks.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Timeout (ms)</label>
              <input
                type="number"
                value={step.timeoutMs ?? 30000}
                onChange={(e) => updateStep(index, { ...step, timeoutMs: parseInt(e.target.value) || 30000 })}
                placeholder="30000"
                style={{ ...inputStyle, maxWidth: '140px' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-card)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-main)',
  padding: '8px 12px',
  fontSize: '12px',
  outline: 'none',
  width: '100%',
  transition: 'border-color var(--transition-fast)',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-card)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-main)',
  padding: '8px 12px',
  fontSize: '12px',
  outline: 'none',
  cursor: 'pointer',
  width: '100%',
};
