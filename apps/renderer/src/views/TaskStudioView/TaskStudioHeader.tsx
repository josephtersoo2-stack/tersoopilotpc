import { useState } from 'react';
import {
  BoltIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  LayersIcon,
  ListIcon,
  PlayIcon,
  PlusIcon,
  TemplateIcon,
} from '../../components/icons';
import { useTasksStore } from '../../stores/tasksStore';
import { useTemplatesStore } from '../../stores/templatesStore';

interface TaskStudioHeaderProps {
  onToggleTasksDrawer: () => void;
  isDrawerOpen: boolean;
}

export function TaskStudioHeader({ onToggleTasksDrawer, isDrawerOpen }: TaskStudioHeaderProps) {
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showTemplateSavedToast, setShowTemplateSavedToast] = useState(false);
  const [copiedHeaderId, setCopiedHeaderId] = useState(false);
  const { createTemplate } = useTemplatesStore();
  const {
    tasks,
    selectedTaskId,
    currentWorkflow,
    updateWorkflowName,
    activeTab,
    setActiveTab,
    isDirty,
    isSaving,
    saveTask,
    createNewTask,
    openDispatchModal,
    validationErrors,
  } = useTasksStore();

  const hasErrors = validationErrors.length > 0;

  const handleSave = async () => {
    const res = await saveTask();
    if (res) {
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2500);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!currentWorkflow) return;
    const selectedTask = tasks.find((t) => t.id === selectedTaskId);
    try {
      await createTemplate({
        name: currentWorkflow.name || 'Custom Workflow Template',
        category: 'custom',
        description: 'Saved from Task Studio',
        definition: currentWorkflow,
        tags: ['studio', 'custom'],
      });
      setShowTemplateSavedToast(true);
      setTimeout(() => setShowTemplateSavedToast(false), 2500);
    } catch (err: any) {
      alert(`Failed to save template: ${err?.message || String(err)}`);
    }
  };

  return (
    <header
      style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-card)',
        background: 'rgba(15, 22, 36, 0.7)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}
    >
      {/* Left: Task Title & Meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onToggleTasksDrawer}
          title="Open Saved Tasks & Workflows"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isDrawerOpen ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)',
            border: isDrawerOpen ? '1px solid #3b82f6' : '1px solid var(--border-card)',
            color: isDrawerOpen ? '#60a5fa' : '#ffffff',
            padding: '7px 12px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            transition: 'all var(--transition-fast)',
          }}
        >
          <ListIcon size={14} />
          <span>Saved Tasks</span>
          <span
            style={{
              background: '#3b82f6',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '10px',
            }}
          >
            {tasks.length}
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa',
            }}
          >
            <BoltIcon size={14} />
          </div>

          <input
            type="text"
            value={currentWorkflow.name}
            onChange={(e) => updateWorkflowName(e.target.value)}
            placeholder="Workflow Name"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#ffffff',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              outline: 'none',
              transition: 'border-color var(--transition-fast)',
              minWidth: '220px',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-focus)';
              e.currentTarget.style.background = 'var(--bg-input)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.background = 'transparent';
            }}
          />

          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            v{currentWorkflow.schemaVersion}
          </span>

          {selectedTaskId && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
                title={`Full Task ID: ${selectedTaskId}`}
              >
                ID: {selectedTaskId.slice(0, 8)}...
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void navigator.clipboard.writeText(selectedTaskId);
                  setCopiedHeaderId(true);
                  setTimeout(() => setCopiedHeaderId(false), 1500);
                }}
                title={`Copy Task ID (${selectedTaskId}) to give to AI agent`}
                style={{
                  background: copiedHeaderId ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  border: copiedHeaderId ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: copiedHeaderId ? '#34d399' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '10px',
                  fontWeight: 600,
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!copiedHeaderId) {
                    e.currentTarget.style.color = '#60a5fa';
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!copiedHeaderId) {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
              >
                {copiedHeaderId ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
                <span>{copiedHeaderId ? 'Copied' : 'Copy ID'}</span>
              </button>
            </div>
          )}

          {isDirty && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.1)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#f59e0b',
                }}
              />
              Unsaved
            </span>
          )}

          {hasErrors && (
            <span
              style={{
                fontSize: '11px',
                color: '#f43f5e',
                background: 'rgba(244, 63, 94, 0.1)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
              }}
            >
              {validationErrors.length} Issue{validationErrors.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Center: Tabs Switcher (Visual vs JSON) */}
      <div
        style={{
          display: 'flex',
          background: 'var(--bg-app)',
          padding: '3px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <button
          onClick={() => setActiveTab('visual')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            background: activeTab === 'visual' ? '#1e293b' : 'transparent',
            color: activeTab === 'visual' ? '#ffffff' : 'var(--text-muted)',
            boxShadow: activeTab === 'visual' ? '0 1px 3px rgba(0,0,0,0.5)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          <LayersIcon size={13} />
          <span>Visual Builder</span>
        </button>

        <button
          onClick={() => setActiveTab('json')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            background: activeTab === 'json' ? '#1e293b' : 'transparent',
            color: activeTab === 'json' ? '#ffffff' : 'var(--text-muted)',
            boxShadow: activeTab === 'json' ? '0 1px 3px rgba(0,0,0,0.5)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          <CodeIcon size={13} />
          <span>JSON Editor</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => createNewTask()}
          title="Create New Blank Workflow"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-card)',
            color: 'var(--text-main)',
            padding: '7px 12px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          }}
        >
          <PlusIcon size={13} />
          <span>New</span>
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: showSavedToast ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.15)',
            border: showSavedToast ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.35)',
            color: '#34d399',
            padding: '7px 14px',
            borderRadius: 'var(--radius-md)',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            opacity: isSaving ? 0.6 : 1,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!isSaving) e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
          }}
          onMouseLeave={(e) => {
            if (!isSaving) e.currentTarget.style.background = showSavedToast ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.15)';
          }}
        >
          <CheckIcon size={13} />
          <span>{showSavedToast ? '✓ Saved to Database!' : isSaving ? 'Saving...' : 'Save Workflow'}</span>
        </button>

        <button
          onClick={handleSaveAsTemplate}
          title="Publish current workflow into Template Hub"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: showTemplateSavedToast ? 'rgba(14, 165, 233, 0.35)' : 'rgba(14, 165, 233, 0.15)',
            border: showTemplateSavedToast ? '1px solid #0ea5e9' : '1px solid rgba(14, 165, 233, 0.35)',
            color: '#38bdf8',
            padding: '7px 12px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = showTemplateSavedToast ? 'rgba(14, 165, 233, 0.35)' : 'rgba(14, 165, 233, 0.15)';
          }}
        >
          <TemplateIcon size={13} />
          <span>{showTemplateSavedToast ? '✓ Saved as Template!' : 'Save as Template'}</span>
        </button>

        <button
          onClick={openDispatchModal}
          disabled={hasErrors}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: hasErrors
              ? 'rgba(75, 85, 99, 0.4)'
              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            color: '#ffffff',
            padding: '7px 16px',
            borderRadius: 'var(--radius-md)',
            cursor: hasErrors ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: hasErrors ? 'none' : '0 0 16px rgba(59, 130, 246, 0.35)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <PlayIcon size={12} />
          <span>Dispatch Run</span>
        </button>
      </div>
    </header>
  );
}
