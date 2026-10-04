import { useEffect, useState } from 'react';

import { BoltIcon, CheckIcon, CopyIcon, PlusIcon, RefreshIcon, TrashIcon, XIcon } from '../../components/icons';
import { useTasksStore } from '../../stores/tasksStore';

interface TaskDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TaskDrawer({ isOpen, onClose }: TaskDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const {
    tasks,
    selectedTaskId,
    loadTasks,
    selectTask,
    deleteTask,
    createNewTask,
    isLoading,
  } = useTasksStore();

  useEffect(() => {
    if (isOpen) {
      void loadTasks(false);
    }
  }, [isOpen, loadTasks]);

  if (!isOpen) return null;

  const filteredTasks = tasks.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: '48px',
          left: '200px',
          right: 0,
          bottom: '28px',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 998,
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: '48px',
          left: '200px',
          bottom: '28px',
          width: '380px',
          background: '#0a0e17',
          borderRight: '1px solid var(--border-card)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '12px 0 35px rgba(0, 0, 0, 0.8)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BoltIcon size={16} color="#60a5fa" />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Saved Workflows</span>
            <span
              style={{
                fontSize: '11px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                padding: '1px 7px',
                borderRadius: '10px',
                color: '#93c5fd',
                fontWeight: 600,
              }}
            >
              {tasks.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => {
                void loadTasks(false);
              }}
              title="Refresh Tasks"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              <RefreshIcon size={14} className={isLoading ? 'pulse' : ''} />
            </button>
            <button
              onClick={onClose}
              title="Close Drawer"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div style={{ padding: '12px 16px 6px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              gap: '8px',
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved tasks..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontSize: '12px',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        </div>

        {/* New Task Button */}
        <div style={{ padding: '8px 16px 12px 16px' }}>
          <button
            onClick={() => {
              createNewTask();
              onClose();
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: '#60a5fa',
              padding: '9px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
            }}
          >
            <PlusIcon size={13} />
            <span>Create New Workflow</span>
          </button>
        </div>

        {/* Task List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 12px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {filteredTasks.length === 0 && !isLoading && (
            <div
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                color: 'var(--text-dim)',
                fontSize: '12px',
              }}
            >
              {searchQuery
                ? `No tasks match "${searchQuery}".`
                : 'No saved tasks yet. Create and save your first workflow!'}
            </div>
          )}

          {filteredTasks.map((task) => {
            const isSelected = selectedTaskId === task.id;
            return (
              <div
                key={task.id}
                onClick={() => {
                  void selectTask(task.id);
                  onClose();
                }}
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected
                    ? '1px solid #3b82f6'
                    : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  boxShadow: isSelected ? '0 0 14px rgba(59, 130, 246, 0.2)' : 'none',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isSelected ? '#60a5fa' : '#ffffff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.name}
                    </span>
                    {isSelected && (
                      <span
                        style={{
                          fontSize: '9px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      Updated {new Date(task.updatedAt).toLocaleDateString()}
                    </span>
                    {task.tags && task.tags.length > 0 && (
                      <span
                        style={{
                          fontSize: '10px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: 'var(--text-muted)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 500,
                        }}
                      >
                        {task.tags[0]}
                      </span>
                    )}
                  </div>

                  {/* Task ID and 1-Click Copy */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        maxWidth: '190px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Task ID: ${task.id}`}
                    >
                      {task.id}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigator.clipboard.writeText(task.id);
                        setCopiedTaskId(task.id);
                        setTimeout(() => setCopiedTaskId(null), 1500);
                      }}
                      title="Copy Task ID to give to AI agent"
                      style={{
                        background: copiedTaskId === task.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                        border: copiedTaskId === task.id ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                        color: copiedTaskId === task.id ? '#34d399' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        transition: 'all var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => {
                        if (copiedTaskId !== task.id) {
                          e.currentTarget.style.color = '#60a5fa';
                          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (copiedTaskId !== task.id) {
                          e.currentTarget.style.color = 'var(--text-muted)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                    >
                      {copiedTaskId === task.id ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
                      <span>{copiedTaskId === task.id ? 'Copied' : 'Copy ID'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteTask(task.id);
                    }}
                    title="Delete task"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#f43f5e';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-dim)';
                    }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
