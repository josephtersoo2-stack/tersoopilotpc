import { useEffect, useRef, useState } from 'react';
import type { PromptCategory, PromptItem } from '@tersoo/contracts';
import { usePromptsStore } from '../../stores/promptsStore';
import {
  BoltIcon,
  CheckIcon,
  CopyIcon,
  CpuIcon,
  EyeIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
} from '../../components/icons';

const CATEGORIES: Array<{ key: PromptCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All Prompts' },
  { key: 'copilot', label: 'Copilot & Assistant' },
  { key: 'automation', label: 'Automation Agent' },
  { key: 'vision', label: 'Computer Vision' },
  { key: 'testing', label: 'Diagnostic Testing' },
];

export function PromptsView() {
  const {
    prompts,
    selectedPromptId,
    editingText,
    searchQuery,
    selectedCategory,
    loading,
    saving,
    resetting,
    testing,
    testResult,
    statusMessage,
    loadPrompts,
    selectPrompt,
    setEditingText,
    setSearchQuery,
    setSelectedCategory,
    saveCurrentPrompt,
    resetCurrentPrompt,
    resetAllPrompts,
    testCurrentPrompt,
    clearStatusMessage,
  } = usePromptsStore();

  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  // Handle Ctrl+S / Cmd+S inside editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveCurrentPrompt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentPrompt]);

  const activePrompt = prompts.find((p) => p.id === selectedPromptId) || prompts[0];
  const hasUnsavedChanges = activePrompt ? editingText !== activePrompt.currentText : false;

  const filteredPrompts = prompts.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.currentText.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const totalCustom = prompts.filter((p) => p.isCustom).length;
  const totalDefault = prompts.filter((p) => !p.isCustom).length;

  const handleCopyText = () => {
    void navigator.clipboard.writeText(editingText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertVariable = (variable: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertVal = `\${${variable}}`;
    const nextText = editingText.substring(0, start) + insertVal + editingText.substring(end);
    setEditingText(nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertVal.length, start + insertVal.length);
    }, 50);
  };

  const getCategoryBadge = (cat: PromptCategory) => {
    switch (cat) {
      case 'copilot':
        return { label: 'Copilot', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' };
      case 'automation':
        return { label: 'Automation', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)' };
      case 'vision':
        return { label: 'Vision / CAPTCHA', color: '#34d399', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'testing':
        return { label: 'Diagnostics', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
      default:
        return { label: 'Custom', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 32px',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      {/* View Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc',
              }}
            >
              <SparklesIcon size={20} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                }}
              >
                Prompt Studio
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Inspect, calibrate, and edit all system prompts and LLM agent instructions in real-time.
              </p>
            </div>
          </div>
        </div>

        {/* Global Summary Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: '#131b2e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <span style={{ color: '#94a3b8' }}>Total:</span>
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{prompts.length}</span>
          </div>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <span style={{ color: '#c084fc' }}>Customized:</span>
            <span style={{ fontWeight: 700, color: '#e9d5ff' }}>{totalCustom}</span>
          </div>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: '#131b2e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <span style={{ color: '#94a3b8' }}>Default:</span>
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{totalDefault}</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetAllConfirm(true)}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#f87171',
              borderColor: 'rgba(239, 68, 68, 0.3)',
            }}
            title="Reset all prompts to original factory defaults"
          >
            <RefreshIcon size={13} />
            <span>Reset All Defaults</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {statusMessage && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            background:
              statusMessage.type === 'success'
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(239, 68, 68, 0.12)',
            border:
              statusMessage.type === 'success'
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : '1px solid rgba(239, 68, 68, 0.3)',
            color: statusMessage.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusMessage.type === 'success' ? <CheckIcon size={16} /> : <BoltIcon size={16} />}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={clearStatusMessage}
            style={{
              background: 'none',
              border: 'none',
              color: 'currentColor',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  border: isActive
                    ? '1px solid rgba(59, 130, 246, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.25) 0%, rgba(99, 102, 241, 0.15) 100%)'
                    : '#131b2e',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <SearchIcon
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
            }}
          />
          <input
            type="text"
            className="input-field"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts or text..."
            style={{
              paddingLeft: '32px',
              height: '34px',
              fontSize: '12px',
              width: '100%',
              borderRadius: '6px',
              backgroundColor: '#131b2e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#f1f5f9',
            }}
          />
        </div>
      </div>

      {/* Main Split Layout: Prompt List + Prompt Editor */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: '20px',
          flex: 1,
          minHeight: '520px',
        }}
      >
        {/* Left Column: Prompt Cards */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 230px)',
            paddingRight: '4px',
          }}
        >
          {loading && prompts.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              Loading prompts...
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div
              style={{
                padding: '30px 20px',
                textAlign: 'center',
                backgroundColor: '#101626',
                borderRadius: '8px',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              No matching prompts found.
            </div>
          ) : (
            filteredPrompts.map((p) => {
              const isSelected = p.id === activePrompt?.id;
              const badge = getCategoryBadge(p.category);
              const isEdited = p.id === selectedPromptId && editingText !== p.currentText;

              return (
                <div
                  key={p.id}
                  onClick={() => selectPrompt(p.id)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    backgroundColor: isSelected ? '#162238' : '#0e1526',
                    border: isSelected
                      ? '1px solid rgba(59, 130, 246, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.07)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 16px rgba(0, 0, 0, 0.35)' : 'none',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        color: badge.color,
                        backgroundColor: badge.bg,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isEdited && (
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#fbbf24',
                            display: 'inline-block',
                          }}
                          title="Unsaved modifications"
                        />
                      )}
                      {p.isCustom ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            color: '#34d399',
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                          }}
                        >
                          Customized
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#64748b',
                            padding: '1px 6px',
                          }}
                        >
                          Default
                        </span>
                      )}
                    </div>
                  </div>

                  <h3
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isSelected ? '#60a5fa' : '#f1f5f9',
                      lineHeight: 1.3,
                    }}
                  >
                    {p.title}
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      color: '#94a3b8',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {p.description}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Prompt Editor Workspace */}
        {activePrompt ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0c1222',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Editor Header Bar */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#10172b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                    {activePrompt.title}
                  </h2>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: '#94a3b8',
                      padding: '2px 6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '4px',
                    }}
                  >
                    id: {activePrompt.id}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                  {activePrompt.description}
                </p>
              </div>

              {/* Status and Metrics */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                  }}
                >
                  {editingText.length.toLocaleString()} chars · ~{Math.round(editingText.length / 4)} tokens
                </span>

                {hasUnsavedChanges && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    Unsaved Edits
                  </span>
                )}

                {/* Diff Toggle Button */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDiff(!showDiff)}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: showDiff ? 'rgba(59, 130, 246, 0.2)' : undefined,
                    borderColor: showDiff ? 'rgba(59, 130, 246, 0.4)' : undefined,
                  }}
                  title="Compare with Factory Default"
                >
                  <EyeIcon size={12} />
                  <span>{showDiff ? 'Hide Default' : 'Compare Default'}</span>
                </button>

                {/* Copy button */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCopyText}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Copy prompt text to clipboard"
                >
                  {copied ? <CheckIcon size={12} color="#34d399" /> : <CopyIcon size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Template Variables Helper Bar */}
            {activePrompt.variables && activePrompt.variables.length > 0 && (
              <div
                style={{
                  padding: '8px 20px',
                  backgroundColor: '#0a0f1d',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                  TEMPLATE VARIABLES:
                </span>
                {activePrompt.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleInsertVariable(v)}
                    style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: '#38bdf8',
                      backgroundColor: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    title={`Click to insert \${${v}} at cursor`}
                  >
                    + ${'{' + v + '}'}
                  </button>
                ))}
              </div>
            )}

            {/* Comparison / Diff View (if toggled) */}
            {showDiff && (
              <div
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#070b14',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  FACTORY DEFAULT TEXT:
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    fontFamily: 'Consolas, "JetBrains Mono", monospace',
                    color: '#64748b',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {activePrompt.defaultText}
                </pre>
              </div>
            )}

            {/* Main Textarea Editor */}
            <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="Enter prompt instructions here..."
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '340px',
                  backgroundColor: '#070b16',
                  color: '#f8fafc',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '16px',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: 'Consolas, "JetBrains Mono", "Fira Code", monospace',
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                  e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* LLM Test Probe Result Banner */}
            {testResult && (
              <div
                style={{
                  margin: '0 20px 12px 20px',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  fontSize: '12px',
                  color: testResult.success ? '#34d399' : '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong>LLM Verification:</strong> {testResult.reply}
                </div>
                {testResult.latencyMs && (
                  <span style={{ fontSize: '11px', opacity: 0.8, fontFamily: 'monospace' }}>
                    {testResult.latencyMs}ms
                  </span>
                )}
              </div>
            )}

            {/* Action Bar Footer */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#10172b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void resetCurrentPrompt()}
                  disabled={resetting || !activePrompt.isCustom}
                  style={{
                    fontSize: '12px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: activePrompt.isCustom ? 1 : 0.5,
                  }}
                  title="Revert this prompt back to system default"
                >
                  <RefreshIcon size={13} className={resetting ? 'pulse' : undefined} />
                  <span>{resetting ? 'Resetting...' : 'Revert to Default'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void testCurrentPrompt()}
                  disabled={testing}
                  style={{
                    fontSize: '12px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Test prompt connectivity with active model"
                >
                  <BoltIcon size={13} className={testing ? 'pulse' : undefined} />
                  <span>{testing ? 'Testing LLM...' : 'Dry-Run Test'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Press <kbd style={{ padding: '2px 4px', backgroundColor: '#070b14', borderRadius: '3px' }}>Ctrl+S</kbd> to save
                </span>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveCurrentPrompt()}
                  disabled={saving || !hasUnsavedChanges}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: hasUnsavedChanges
                      ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)'
                      : undefined,
                    boxShadow: hasUnsavedChanges
                      ? '0 0 16px rgba(59, 130, 246, 0.4)'
                      : 'none',
                    opacity: hasUnsavedChanges ? 1 : 0.6,
                  }}
                >
                  <CheckIcon size={14} />
                  <span>{saving ? 'Saving...' : 'Save Prompt'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0c1222',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              fontSize: '14px',
            }}
          >
            Select a prompt on the left to edit.
          </div>
        )}
      </div>

      {/* Confirmation Modal for Reset All Defaults */}
      {showResetAllConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              width: '420px',
              backgroundColor: '#101626',
              borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#ffffff' }}>
              Reset All Prompts to Factory Default?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              This will overwrite all customized prompts with their original system defaults. Any custom instructions or calibrations you entered will be lost.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowResetAllConfirm(false)}
                style={{ fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowResetAllConfirm(false);
                  void resetAllPrompts();
                }}
                style={{
                  fontSize: '12px',
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                }}
              >
                Reset All Prompts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptsView;
