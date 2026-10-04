import React, { useEffect, useState, useMemo } from 'react';
import type {
  TaskTemplate,
  TaskTemplateCategory,
  TemplateCreateInput,
  TemplateUpdateInput,
  Workflow,
} from '@tersoo/contracts';
import { useTemplatesStore } from '../../stores/templatesStore';
import { useTasksStore } from '../../stores/tasksStore';
import { useProfilesStore } from '../../stores/profilesStore';
import {
  BoltIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DuplicateIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SlidersIcon,
  SparklesIcon,
  TemplateIcon,
  TrashIcon,
  XIcon,
} from '../../components/icons';

interface TemplatesViewProps {
  onSelectView?: (view: string) => void;
}

export function TemplatesView({ onSelectView }: TemplatesViewProps) {
  const {
    templates,
    loading,
    error,
    loadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    instantiateTemplate,
  } = useTemplatesStore();

  const { loadTasks, selectTask } = useTasksStore();
  const { profiles, loadProfiles } = useProfilesStore();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Use / Instantiate Modal State
  const [instantiateModalTemplate, setInstantiateModalTemplate] = useState<TaskTemplate | null>(null);
  const [taskNameInput, setTaskNameInput] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [enableRandomization, setEnableRandomization] = useState(true);
  const [likeProb, setLikeProb] = useState(0.85);
  const [subProb, setSubProb] = useState(0.5);
  const [commentProb, setCommentProb] = useState(0.65);
  const [isInstantiating, setIsInstantiating] = useState(false);
  const [spintaxPreview, setSpintaxPreview] = useState<string>('');

  // Create / Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<TaskTemplateCategory>('custom');
  const [formDescription, setFormDescription] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formJsonDefinition, setFormJsonDefinition] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  useEffect(() => {
    void loadTemplates();
    void loadProfiles();
  }, [loadTemplates, loadProfiles]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchesCategory = selectedCategory === 'all' || tpl.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tpl.name.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        (tpl.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [templates, selectedCategory, searchQuery]);

  // Resolve simple Spintax for preview
  const generateSpintaxSample = (text: string): string => {
    const spintaxRegex = /\{([^{}]+)\}/g;
    return text.replace(spintaxRegex, (_, choices) => {
      const parts = choices.split('|');
      return parts[Math.floor(Math.random() * parts.length)].trim();
    });
  };

  // Open Instantiate Modal
  const handleOpenInstantiate = (tpl: TaskTemplate) => {
    setInstantiateModalTemplate(tpl);
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    setTaskNameInput(`${tpl.name} - ${dateStr}`);

    // Pre-populate variables from definition
    const vars: Record<string, string> = {};
    const rawVars = tpl.definition?.variables || {};
    for (const [k, v] of Object.entries(rawVars)) {
      if (Array.isArray(v)) {
        vars[k] = v.join('\n');
      } else {
        vars[k] = String(v ?? '');
      }
    }
    setVariableValues(vars);

    // Initial Spintax sample if commentText exists
    const commentVar = vars['commentText'] || vars['customComment'] || '';
    if (commentVar) {
      setSpintaxPreview(generateSpintaxSample(commentVar));
    } else {
      setSpintaxPreview('');
    }

    setEnableRandomization(true);
    setLikeProb(0.85);
    setSubProb(0.5);
    setCommentProb(0.65);
  };

  // Execute Instantiate
  const handleConfirmInstantiate = async (dispatchImmediately: boolean = false) => {
    if (!instantiateModalTemplate) return;
    if (!taskNameInput.trim()) {
      alert('Task name is required');
      return;
    }

    setIsInstantiating(true);
    try {
      // Format variables
      const formattedVars: Record<string, any> = {};
      for (const [k, v] of Object.entries(variableValues)) {
        if (v.includes('\n')) {
          formattedVars[k] = v
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          formattedVars[k] = v.trim();
        }
      }

      const newTask = await instantiateTemplate({
        templateId: instantiateModalTemplate.id,
        taskName: taskNameInput.trim(),
        variables: formattedVars,
        randomize: enableRandomization,
        actionProbabilities: enableRandomization
          ? {
              like: likeProb,
              subscribe: subProb,
              comment: commentProb,
            }
          : undefined,
      });

      await loadTasks();
      selectTask(newTask.id);
      setInstantiateModalTemplate(null);

      showToast(`Created task "${newTask.name}" from template!`);

      if (onSelectView) {
        onSelectView('tasks');
      }
    } catch (err: any) {
      alert(`Failed to instantiate template: ${err?.message || String(err)}`);
    } finally {
      setIsInstantiating(false);
    }
  };

  // Open Create/Edit Modal
  const handleOpenCreateModal = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormCategory('custom');
    setFormDescription('');
    setFormTags('');
    setFormJsonDefinition(
      JSON.stringify(
        {
          name: 'Custom Anti-Sybil Workflow',
          description: 'Customized multi-step automated scenario',
          variables: {
            searchKeywords: ['keyword 1', 'keyword 2', 'keyword 3'],
            commentText: '{Awesome|Great|Helpful} post! {Thanks for sharing|Loved this}!',
          },
          steps: [
            {
              type: 'navigate',
              url: 'https://www.example.com',
              allowedHosts: ['example.com'],
              waitUntil: 'domcontentloaded',
              timeoutMs: 30000,
            },
            {
              type: 'scroll',
              direction: 'down',
              amount: 500,
              kinetic: true,
            },
            {
              type: 'sleep',
              minMs: 2000,
              maxMs: 4000,
            },
          ],
        },
        null,
        2,
      ),
    );
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditModal = (tpl: TaskTemplate) => {
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormCategory(tpl.category);
    setFormDescription(tpl.description || '');
    setFormTags((tpl.tags || []).join(', '));
    setFormJsonDefinition(JSON.stringify(tpl.definition, null, 2));
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Template title is required.');
      return;
    }

    let parsedWorkflow: Workflow;
    try {
      parsedWorkflow = JSON.parse(formJsonDefinition);
      if (!Array.isArray(parsedWorkflow.steps)) {
        throw new Error('Workflow definition must contain a "steps" array.');
      }
    } catch (err: any) {
      setFormError(`Invalid JSON workflow definition: ${err?.message || String(err)}`);
      return;
    }

    setIsSubmittingForm(true);
    setFormError(null);

    const tags = formTags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    try {
      if (editingTemplate) {
        await updateTemplate({
          id: editingTemplate.id,
          name: formName.trim(),
          category: formCategory,
          description: formDescription.trim(),
          definition: parsedWorkflow,
          tags,
        });
        showToast(`Template "${formName.trim()}" updated successfully.`);
      } else {
        await createTemplate({
          name: formName.trim(),
          category: formCategory,
          description: formDescription.trim(),
          definition: parsedWorkflow,
          tags,
        });
        showToast(`Template "${formName.trim()}" created successfully.`);
      }
      setIsEditModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || String(err));
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleDeleteTemplate = async (tpl: TaskTemplate) => {
    if (tpl.isBuiltin) {
      alert('Built-in system templates cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to delete template "${tpl.name}"?`)) return;

    try {
      await deleteTemplate(tpl.id);
      showToast(`Template "${tpl.name}" deleted.`);
    } catch (err: any) {
      alert(`Failed to delete template: ${err?.message || String(err)}`);
    }
  };

  const handleDuplicateAsCustom = async (tpl: TaskTemplate) => {
    try {
      const duplicated = await createTemplate({
        name: `${tpl.name} (Custom Copy)`,
        category: 'custom',
        description: tpl.description,
        definition: tpl.definition,
        tags: [...(tpl.tags || []), 'copy'],
      });
      showToast(`Duplicated into custom template "${duplicated.name}".`);
    } catch (err: any) {
      alert(`Failed to duplicate template: ${err?.message || String(err)}`);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'youtube':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'warming':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
      case 'seo':
        return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
      case 'social':
        return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0e17',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 9999,
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 500,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <CheckIcon size={16} color="#34d399" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(59, 130, 246, 0.4)',
            }}
          >
            <TemplateIcon size={20} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Workflow Templates Hub
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Battle-tested automation blueprints with Anti-Sybil variance & Spintax randomization
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              <SearchIcon size={14} />
            </div>
            <input
              type="text"
              placeholder="Search templates or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-card)',
                borderRadius: 'var(--radius-md)',
                color: '#ffffff',
                fontSize: '12px',
                padding: '7px 12px 7px 32px',
                width: '230px',
                outline: 'none',
                transition: 'all var(--transition-fast)',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-card)')}
            />
          </div>

          <button
            onClick={() => void loadTemplates()}
            title="Refresh templates"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-card)',
              color: 'var(--text-muted)',
              padding: '7px 10px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshIcon size={14} />
          </button>

          <button
            onClick={handleOpenCreateModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              color: '#ffffff',
              padding: '7px 14px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              boxShadow: '0 0 16px rgba(59, 130, 246, 0.3)',
            }}
          >
            <PlusIcon size={14} />
            <span>Create Template</span>
          </button>
        </div>
      </header>

      {/* Category Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          background: 'rgba(15, 22, 36, 0.4)',
          borderBottom: '1px solid var(--border-card)',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'all', label: 'All Templates' },
          { id: 'warming', label: '🛡️ Cookie Warming & Trust' },
          { id: 'youtube', label: '▶️ YouTube Dual-Video' },
          { id: 'seo', label: '🔍 Google SEO CTR' },
          { id: 'social', label: '🐦 Social Media' },
          { id: 'custom', label: '⚙️ Custom Blueprints' },
        ].map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: isActive ? '1px solid #3b82f6' : '1px solid transparent',
                background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: isActive ? '#60a5fa' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content: Template Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}
      >
        {loading && templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <p>Loading workflow templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 20px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '12px',
              border: '1px dashed var(--border-card)',
              maxWidth: '500px',
              margin: '40px auto',
            }}
          >
            <TemplateIcon size={36} color="#64748b" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', margin: '0 0 6px' }}>
              No templates found
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {searchQuery
                ? `No templates matching "${searchQuery}"`
                : 'No templates in this category yet.'}
            </p>
            <button
              onClick={handleOpenCreateModal}
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              + Create First Custom Template
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '20px',
            }}
          >
            {filteredTemplates.map((tpl) => {
              const catTheme = getCategoryColor(tpl.category);
              const steps = tpl.definition?.steps || [];
              const rawVars = tpl.definition?.variables || {};
              const hasPools = Object.values(rawVars).some((v) => Array.isArray(v));
              const hasSpintax = Object.values(rawVars).some(
                (v) => typeof v === 'string' && /\{.*\|.*\}/.test(v),
              );

              return (
                <div
                  key={tpl.id}
                  style={{
                    background: '#0f1626',
                    border: '1px solid var(--border-card)',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-card)';
                  }}
                >
                  <div>
                    {/* Top Row: Category Badge & Builtin Status */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '12px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: catTheme.bg,
                          color: catTheme.text,
                          border: `1px solid ${catTheme.border}`,
                        }}
                      >
                        {tpl.category}
                      </span>

                      {tpl.isBuiltin ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckIcon size={12} />
                          Verified Builtin
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                          }}
                        >
                          Custom Blueprint
                        </span>
                      )}
                    </div>

                    {/* Template Title & Description */}
                    <h2
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        margin: '0 0 8px',
                        color: '#f8fafc',
                      }}
                    >
                      {tpl.name}
                    </h2>
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        margin: '0 0 16px',
                        lineHeight: 1.5,
                        minHeight: '36px',
                      }}
                    >
                      {tpl.description}
                    </p>

                    {/* Features Badges: Anti-Sybil Variance, Spintax, Pools */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginBottom: '16px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#cbd5e1',
                        }}
                      >
                        ⚡ {steps.length} Steps
                      </span>
                      {hasPools && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(168, 85, 247, 0.15)',
                            color: '#c084fc',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                          }}
                        >
                          🎲 Variable Pools
                        </span>
                      )}
                      {hasSpintax && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          🔀 Spintax Comments
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                        }}
                      >
                        🛡️ Anti-Sybil Engine
                      </span>
                    </div>

                    {/* Tags */}
                    {tpl.tags && tpl.tags.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '4px',
                          marginBottom: '16px',
                        }}
                      >
                        {tpl.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              background: 'rgba(255, 255, 255, 0.03)',
                              padding: '1px 6px',
                              borderRadius: '3px',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div
                    style={{
                      borderTop: '1px solid var(--border-card)',
                      paddingTop: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleDuplicateAsCustom(tpl)}
                        title="Duplicate as Custom Blueprint"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-card)',
                          color: 'var(--text-muted)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <DuplicateIcon size={13} />
                      </button>

                      {tpl.isBuiltin ? (
                        <button
                          onClick={() => handleOpenEditModal(tpl)}
                          title="View template definition"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-card)',
                            color: 'var(--text-muted)',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <CodeIcon size={13} />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(tpl)}
                            title="Edit Custom Blueprint"
                            style={{
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              color: '#60a5fa',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tpl)}
                            title="Delete template"
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenInstantiate(tpl)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        border: '1px solid rgba(59, 130, 246, 0.5)',
                        color: '#ffffff',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        boxShadow: '0 0 12px rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      <BoltIcon size={12} />
                      <span>Use Template</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Use / Instantiate Template with Anti-Sybil Controls */}
      {instantiateModalTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#0f1626',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BoltIcon size={16} color="#ffffff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                    Instantiate: {instantiateModalTemplate.name}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Configure workflow parameters and Anti-Sybil randomization
                  </span>
                </div>
              </div>
              <button
                onClick={() => setInstantiateModalTemplate(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Task Name */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    color: '#e2e8f0',
                  }}
                >
                  Task Name
                </label>
                <input
                  type="text"
                  value={taskNameInput}
                  onChange={(e) => setTaskNameInput(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Dynamic Variables Section */}
              {Object.keys(variableValues).length > 0 && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                      Workflow Variables & Pools
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Enter multiple keywords on new lines for pools
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Object.entries(variableValues).map(([key, val]) => {
                      const isPool = val.includes('\n');
                      const isSpintax = /\{.*\|.*\}/.test(val);

                      return (
                        <div key={key}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '4px',
                            }}
                          >
                            <label
                              style={{
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#93c5fd',
                              }}
                            >
                              {`{{${key}}}`}
                            </label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {isPool && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#c084fc',
                                    background: 'rgba(168, 85, 247, 0.15)',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                  }}
                                >
                                  Pool ({val.split('\n').filter(Boolean).length} items)
                                </span>
                              )}
                              {isSpintax && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#fbbf24',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                  }}
                                >
                                  Spintax
                                </span>
                              )}
                            </div>
                          </div>

                          {isPool || key.toLowerCase().includes('topic') || key.toLowerCase().includes('keywords') || key.toLowerCase().includes('comment') ? (
                            <textarea
                              rows={key.toLowerCase().includes('comment') ? 2 : 3}
                              value={val}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                setVariableValues((prev) => ({ ...prev, [key]: newVal }));
                                if (key.toLowerCase().includes('comment')) {
                                  setSpintaxPreview(generateSpintaxSample(newVal));
                                }
                              }}
                              style={{
                                width: '100%',
                                background: 'rgba(0, 0, 0, 0.25)',
                                border: '1px solid var(--border-card)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                outline: 'none',
                                resize: 'vertical',
                              }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                setVariableValues((prev) => ({ ...prev, [key]: newVal }));
                              }}
                              style={{
                                width: '100%',
                                background: 'rgba(0, 0, 0, 0.25)',
                                border: '1px solid var(--border-card)',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                color: '#ffffff',
                                fontSize: '12px',
                                outline: 'none',
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Spintax Live Sample Generator */}
                  {spintaxPreview && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '6px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#fbbf24' }}>
                          🎲 Generated Unique Spintax Sample:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const c =
                              variableValues['commentText'] ||
                              variableValues['customComment'] ||
                              '';
                            setSpintaxPreview(generateSpintaxSample(c));
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#fbbf24',
                            fontSize: '11px',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Roll Again
                        </button>
                      </div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#f8fafc',
                          margin: 0,
                          fontStyle: 'italic',
                        }}
                      >
                        "{spintaxPreview}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Anti-Sybil Behavioral Variance Controls */}
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.06)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa' }}>
                      Anti-Sybil Behavioral Variance Engine
                    </span>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                      Randomizes keywords, comment wording, and engagement frequency per profile
                    </p>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enableRandomization}
                      onChange={(e) => setEnableRandomization(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </label>
                </div>

                {enableRandomization && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: '#cbd5e1',
                          marginBottom: '2px',
                        }}
                      >
                        <span>Like Action Probability</span>
                        <span>{Math.round(likeProb * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={likeProb}
                        onChange={(e) => setLikeProb(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6' }}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: '#cbd5e1',
                          marginBottom: '2px',
                        }}
                      >
                        <span>Subscribe Action Probability</span>
                        <span>{Math.round(subProb * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={subProb}
                        onChange={(e) => setSubProb(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6' }}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: '#cbd5e1',
                          marginBottom: '2px',
                        }}
                      >
                        <span>Comment Action Probability</span>
                        <span>{Math.round(commentProb * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={commentProb}
                        onChange={(e) => setCommentProb(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--border-card)',
                background: 'rgba(10, 14, 23, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={() => setInstantiateModalTemplate(null)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-card)',
                  color: 'var(--text-muted)',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isInstantiating}
                onClick={() => handleConfirmInstantiate(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  color: '#ffffff',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  cursor: isInstantiating ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  boxShadow: '0 0 16px rgba(59, 130, 246, 0.35)',
                }}
              >
                <CheckIcon size={13} />
                <span>{isInstantiating ? 'Creating...' : 'Create Task in Studio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create / Edit Template Blueprint */}
      {isEditModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#0f1626',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                {editingTemplate ? `Edit Template: ${editingTemplate.name}` : 'Create Workflow Template'}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <XIcon size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveForm}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                gap: '14px',
              }}
            >
              {formError && (
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: '12px',
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. YouTube Anti-Sybil Dual Search & Watch"
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-card)',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      color: '#ffffff',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    style={{
                      width: '100%',
                      background: '#131b2e',
                      border: '1px solid var(--border-card)',
                      borderRadius: '6px',
                      padding: '7px 10px',
                      color: '#ffffff',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  >
                    <option value="warming">Warming & Trust</option>
                    <option value="youtube">YouTube Automation</option>
                    <option value="seo">Google SEO CTR</option>
                    <option value="social">Social Media</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Explain what this automation scenario achieves..."
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '6px',
                    padding: '7px 12px',
                    color: '#ffffff',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g. anti-sybil, video, humanized, spintax"
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '6px',
                    padding: '7px 12px',
                    color: '#ffffff',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Workflow JSON Definition (Variables & Steps)
                </label>
                <textarea
                  rows={14}
                  value={formJsonDefinition}
                  onChange={(e) => setFormJsonDefinition(e.target.value)}
                  style={{
                    width: '100%',
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid var(--border-card)',
                    borderRadius: '6px',
                    padding: '10px',
                    color: '#93c5fd',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-card)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-card)',
                    color: 'var(--text-muted)',
                    padding: '7px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    color: '#ffffff',
                    padding: '7px 16px',
                    borderRadius: '6px',
                    cursor: isSubmittingForm ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {isSubmittingForm ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
