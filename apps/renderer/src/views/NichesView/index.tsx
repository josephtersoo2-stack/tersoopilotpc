import { useEffect, useState } from 'react';
import type { Niche } from '@tersoo/contracts';
import { useNichesStore } from '../../stores/nichesStore';
import { useProfilesStore } from '../../stores/profilesStore';
import {
  CheckIcon,
  LayersIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  XIcon,
} from '../../components/icons';

export function NichesView() {
  const { niches, loading, error, loadNiches, createNiche, updateNiche, deleteNiche } =
    useNichesStore();
  const { profiles } = useProfilesStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNiche, setEditingNiche] = useState<Niche | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [seedUrlsText, setSeedUrlsText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadNiches();
  }, [loadNiches]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenCreate = () => {
    setEditingNiche(null);
    setName('');
    setDescription('');
    setKeywordsText('');
    setSeedUrlsText('');
    setTagsText('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (niche: Niche) => {
    setEditingNiche(niche);
    setName(niche.name);
    setDescription(niche.description || '');
    setKeywordsText(niche.keywords.join('\n'));
    setSeedUrlsText(niche.seedUrls.join('\n'));
    setTagsText(niche.tags.join(', '));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Niche name is required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const keywords = keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter(Boolean);

    const seedUrls = seedUrlsText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    const tags = tagsText
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    try {
      if (editingNiche) {
        await updateNiche({
          id: editingNiche.id,
          name: name.trim(),
          description: description.trim(),
          keywords,
          seedUrls,
          tags,
        });
        showToast(`Updated niche "${name.trim()}".`);
      } else {
        await createNiche({
          name: name.trim(),
          description: description.trim(),
          keywords,
          seedUrls,
          tags,
        });
        showToast(`Created niche "${name.trim()}".`);
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nicheName: string) => {
    if (!confirm(`Are you sure you want to delete the niche "${nicheName}"?`)) {
      return;
    }
    try {
      await deleteNiche(id);
      showToast(`Deleted niche "${nicheName}".`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const countProfilesInNiche = (nicheId: string) => {
    return profiles.filter((p) => p.nicheId === nicheId).length;
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <LayersIcon size={18} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Niches & Topic Verticals
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
            Cluster profiles into organic verticals with specialized search keywords and seed URLs. Workflow steps automatically interpolate variables like <code style={{ color: '#38bdf8' }}>{'{{niche.randomKeyword}}'}</code> and <code style={{ color: '#38bdf8' }}>{'{{niche.seedUrl}}'}</code>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-icon"
            onClick={() => void loadNiches()}
            title="Refresh niches"
            style={{ padding: '8px' }}
          >
            <RefreshIcon size={16} />
          </button>
          <button
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px' }}
          >
            <PlusIcon size={15} />
            <span>Create Niche</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {toastMessage && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckIcon size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#f43f5e',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Niches Grid */}
      {loading && niches.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-dim)' }}>
          Loading niches...
        </div>
      ) : niches.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
            }}
          >
            <LayersIcon size={24} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            No Niches Configured Yet
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)', maxWidth: '450px', margin: 0 }}>
            Create your first niche vertical to organize profiles and supply realistic keyword searches for your automated tasks.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ marginTop: '8px', padding: '8px 18px', fontSize: '13px' }}
          >
            Create First Niche
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
          {niches.map((niche) => {
            const profileCount = countProfilesInNiche(niche.id);
            return (
              <div
                key={niche.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                        {niche.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: '9999px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}
                      >
                        {profileCount} {profileCount === 1 ? 'profile' : 'profiles'}
                      </span>
                    </div>
                    {niche.description && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        {niche.description}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      className="btn-icon"
                      onClick={() => handleOpenEdit(niche)}
                      title="Edit Niche"
                      style={{ padding: '6px' }}
                    >
                      <span style={{ fontSize: '12px' }}>✏️</span>
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => void handleDelete(niche.id, niche.name)}
                      title="Delete Niche"
                      style={{ padding: '6px', color: '#f43f5e' }}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>

                {/* Keywords Chips */}
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    SEARCH KEYWORDS ({niche.keywords.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '110px', overflowY: 'auto' }}>
                    {niche.keywords.length > 0 ? (
                      niche.keywords.map((kw, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(56, 189, 248, 0.1)',
                            color: '#7dd3fc',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                            display: 'inline-block',
                          }}
                        >
                          {kw}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        No keywords defined
                      </span>
                    )}
                  </div>
                </div>

                {/* Seed URLs */}
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    SEED / WARMUP URLS ({niche.seedUrls.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '80px', overflowY: 'auto' }}>
                    {niche.seedUrls.length > 0 ? (
                      niche.seedUrls.map((url, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={url}
                        >
                          🔗 {url}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        No seed URLs defined
                      </span>
                    )}
                  </div>
                </div>

                {/* Tags row */}
                {niche.tags.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                    {niche.tags.map((tag) => (
                      <span key={tag} className="badge badge-tag" style={{ fontSize: '10px' }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '24px',
          }}
          onClick={() => !submitting && setIsModalOpen(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '560px',
              background: '#0d1527',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '6px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                  }}
                >
                  <LayersIcon size={16} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                  {editingNiche ? 'Edit Niche Vertical' : 'Create Niche Vertical'}
                </h3>
              </div>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)} disabled={submitting}>
                <XIcon size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
                {formError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(244, 63, 94, 0.15)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      color: '#f43f5e',
                      fontSize: '12px',
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    NICHE NAME *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Simulation Games, Tech Gadgets, Crypto News"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    DESCRIPTION
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Brief description of this vertical"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    SEARCH KEYWORDS (ONE PER LINE)
                  </label>
                  <textarea
                    className="textarea"
                    rows={4}
                    placeholder="This 249 KM Bus Journey Was INSANE!&#10;Euro Truck Simulator 2 realistic driving&#10;Microsoft Flight Simulator 2024 landing"
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    Workflows can pick a random keyword with {'{{niche.randomKeyword}}'}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    SEED / WARMUP URLS (ONE PER LINE)
                  </label>
                  <textarea
                    className="textarea"
                    rows={3}
                    placeholder="https://youtube.com&#10;https://steamcommunity.com&#10;https://twitch.tv"
                    value={seedUrlsText}
                    onChange={(e) => setSeedUrlsText(e.target.value)}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    Workflows can pick a seed URL with {'{{niche.seedUrl}}'}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    TAGS (COMMA SEPARATED)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="gaming, youtube, warmup"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  background: 'rgba(10, 15, 29, 0.4)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  style={{ padding: '6px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ padding: '6px 18px', fontSize: '12px' }}
                >
                  {submitting ? 'Saving...' : editingNiche ? 'Update Niche' : 'Create Niche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default NichesView;
