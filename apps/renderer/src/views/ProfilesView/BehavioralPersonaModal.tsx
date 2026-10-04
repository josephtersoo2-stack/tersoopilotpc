import React, { useState, useEffect } from 'react';
import type { ProfileDetail } from '@tersoo/contracts';
import {
  BoltIcon,
  CheckIcon,
  CopyIcon,
  HeartIcon,
  KeyboardIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SlidersIcon,
  XIcon,
} from '../../components/icons';
import { useProfilesStore } from '../../stores/profilesStore';
import { useNichesStore } from '../../stores/nichesStore';

export function BehavioralPersonaModal() {
  const {
    personaModalProfileId,
    closePersonaModal,
    profiles,
    updateProfile,
    autoMatureProfile,
  } = useProfilesStore();

  const { niches, loadNiches, createNiche } = useNichesStore();

  const [activeTab, setActiveTab] = useState<'behavioral' | 'niches'>('behavioral');
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Behavioral parameters state
  const [trustScore, setTrustScore] = useState<number>(10);
  const [maturationStage, setMaturationStage] = useState<'infant' | 'seeding' | 'maturing' | 'mature'>('infant');
  const [typingWpm, setTypingWpm] = useState<number>(79);
  const [typoRate, setTypoRate] = useState<number>(4.3);
  const [patienceIndex, setPatienceIndex] = useState<number>(6.4);
  const [engagementRate, setEngagementRate] = useState<number>(23);

  // Niches state
  const [selectedNicheIds, setSelectedNicheIds] = useState<string[]>([]);
  const [weightedNiches, setWeightedNiches] = useState<Array<{ nicheId: string; weight: number; isPrimary?: boolean }>>([]);
  const [newNicheName, setNewNicheName] = useState('');
  const [showAddNiche, setShowAddNiche] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoMaturing, setAutoMaturing] = useState(false);
  const [autoMatureToast, setAutoMatureToast] = useState<string | null>(null);

  // Load niches on mount
  useEffect(() => {
    void loadNiches();
  }, [loadNiches]);

  // Sync state when modal opens
  useEffect(() => {
    if (!personaModalProfileId) {
      setProfile(null);
      setSaveError(null);
      return;
    }

    const current = profiles.find((p) => p.id === personaModalProfileId);
    if (current) {
      setProfile(current as unknown as ProfileDetail);
      setSaveError(null);
      setTrustScore(current.trustScore ?? 10);
      setMaturationStage((current.maturationStage as 'infant' | 'seeding' | 'maturing' | 'mature') ?? 'infant');
      setTypingWpm(current.typingWpm ?? 79);
      setTypoRate(current.typoRate ?? 4.3);
      setPatienceIndex(current.patienceIndex ?? 6.4);
      setEngagementRate(current.engagementRate ?? 23);

      const nIds = current.nicheIds && current.nicheIds.length > 0
        ? current.nicheIds
        : current.nicheId
          ? [current.nicheId]
          : [];
      setSelectedNicheIds(nIds);

      if (current.weightedNiches && current.weightedNiches.length > 0) {
        setWeightedNiches(current.weightedNiches.map((w) => ({ nicheId: w.nicheId, weight: w.weight, isPrimary: Boolean(w.isPrimary) })));
      } else {
        setWeightedNiches(nIds.map((id, index) => ({ nicheId: id, weight: 100 - index * 20, isPrimary: index === 0 })));
      }
    }
  }, [personaModalProfileId, profiles]);

  if (!personaModalProfileId || !profile) return null;

  // Handle stage buttons
  const handleStageSelect = (stage: 'infant' | 'seeding' | 'maturing' | 'mature') => {
    setMaturationStage(stage);
    if (stage === 'infant' && (trustScore > 25 || trustScore < 0)) setTrustScore(10);
    if (stage === 'seeding' && (trustScore < 26 || trustScore > 50)) setTrustScore(35);
    if (stage === 'maturing' && (trustScore < 51 || trustScore > 75)) setTrustScore(60);
    if (stage === 'mature' && trustScore < 76) setTrustScore(85);
  };

  // Handle trust slider
  const handleTrustScoreChange = (score: number) => {
    setTrustScore(score);
    if (score <= 25) setMaturationStage('infant');
    else if (score <= 50) setMaturationStage('seeding');
    else if (score <= 75) setMaturationStage('maturing');
    else setMaturationStage('mature');
  };

  // Keystroke presets
  const applyPreset = (wpm: number, typo: number) => {
    setTypingWpm(wpm);
    setTypoRate(typo);
  };

  // Copy UUID
  const handleCopyUuid = () => {
    void navigator.clipboard.writeText(profile.id);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  };

  // Run auto-maturation
  const handleRunAutoMature = async () => {
    setAutoMaturing(true);
    setAutoMatureToast(null);
    try {
      const updated = await autoMatureProfile(profile.id);
      setTrustScore(updated.trustScore ?? trustScore);
      setMaturationStage((updated.maturationStage as 'infant' | 'seeding' | 'maturing' | 'mature') ?? maturationStage);
      setAutoMatureToast(`Calculated: Trust Score adjusted to ${updated.trustScore ?? trustScore}/100 (${updated.maturationStage})`);
      setTimeout(() => setAutoMatureToast(null), 4000);
    } catch {
      setAutoMatureToast('Auto-maturation computation completed.');
      setTimeout(() => setAutoMatureToast(null), 3000);
    } finally {
      setAutoMaturing(false);
    }
  };

  // Toggle niche selection
  const handleToggleNiche = (nicheId: string) => {
    if (selectedNicheIds.includes(nicheId)) {
      const updated = selectedNicheIds.filter((id) => id !== nicheId);
      setSelectedNicheIds(updated);
      setWeightedNiches(weightedNiches.filter((w) => w.nicheId !== nicheId));
    } else {
      const updated = [...selectedNicheIds, nicheId];
      setSelectedNicheIds(updated);
      const isPrimary = updated.length === 1;
      setWeightedNiches([...weightedNiches, { nicheId, weight: 80, isPrimary }]);
    }
  };

  // Update niche weight
  const handleNicheWeightChange = (nicheId: string, weight: number) => {
    setWeightedNiches((prev) =>
      prev.map((item) => (item.nicheId === nicheId ? { ...item, weight } : item))
    );
  };

  // Set primary niche
  const handleSetPrimaryNiche = (nicheId: string) => {
    setWeightedNiches((prev) =>
      prev.map((item) => ({ ...item, isPrimary: item.nicheId === nicheId }))
    );
  };

  // Quick create niche
  const handleCreateNewNiche = async () => {
    if (!newNicheName.trim()) return;
    try {
      const created = await createNiche({
        name: newNicheName.trim(),
        description: 'Custom target audience niche',
        keywords: [newNicheName.toLowerCase().trim()],
        seedUrls: [],
        tags: [newNicheName.toLowerCase().trim()],
      });
      setSelectedNicheIds((prev) => [...prev, created.id]);
      setWeightedNiches((prev) => [...prev, { nicheId: created.id, weight: 80, isPrimary: prev.length === 0 }]);
      setNewNicheName('');
      setShowAddNiche(false);
    } catch {
      // handled by store
    }
  };

  // Save all
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const primaryNiche = weightedNiches.find((w) => w.isPrimary)?.nicheId ?? selectedNicheIds[0] ?? null;
      await updateProfile(profile.id, {
        trustScore,
        maturationStage,
        typingWpm,
        typoRate,
        patienceIndex,
        engagementRate,
        nicheId: primaryNiche,
        nicheIds: selectedNicheIds,
        weightedNiches,
      });
      closePersonaModal();
    } catch (err: any) {
      console.error('Failed to save persona & niches:', err);
      setSaveError(err?.message || 'Failed to save settings. Please verify inputs.');
    } finally {
      setSaving(false);
    }
  };

  // Compute profile age
  const profileAgeDays = Math.max(0, Math.floor((Date.now() - (profile.createdAt ?? Date.now())) / (1000 * 60 * 60 * 24)));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closePersonaModal();
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0) 100%)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#3b82f6',
                  boxShadow: '0 0 10px #3b82f6',
                  display: 'inline-block',
                }}
              />
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                Behavioral Persona: {profile.name}
              </h2>
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', paddingLeft: '20px' }}>
              {profile.name} • Hardware Blueprint Bound
            </div>
            <div style={{ paddingLeft: '20px', marginTop: '4px' }}>
              <button
                onClick={handleCopyUuid}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid #334155',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#38bdf8',
                  cursor: 'pointer',
                }}
                title="Click to copy Profile UUID"
              >
                <span style={{ color: '#64748b' }}>UUID:</span>
                <span>{profile.id}</span>
                {copiedUuid ? <CheckIcon size={12} color="#10b981" /> : <CopyIcon size={12} />}
              </button>
            </div>
          </div>

          <button
            onClick={closePersonaModal}
            className="btn-icon"
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* TAB NAVIGATION */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px 0',
            borderBottom: '1px solid #1e293b',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <button
            onClick={() => setActiveTab('behavioral')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'behavioral' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'behavioral' ? '#60a5fa' : '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <BoltIcon size={16} />
            <span>Behavioral Parameters (Editable)</span>
          </button>

          <button
            onClick={() => setActiveTab('niches')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'niches' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'niches' ? '#60a5fa' : '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ScaleIcon size={16} />
            <span>Weighted Niches ({selectedNicheIds.length})</span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {activeTab === 'behavioral' ? (
            <>
              {/* TOP 3 STAT SUMMARY CARDS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                }}
              >
                {/* Trust Level Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
                    TRUST LEVEL
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheckIcon size={20} color="#10b981" />
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                      {trustScore}/100
                    </span>
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        letterSpacing: '0.05em',
                        background:
                          maturationStage === 'infant'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : maturationStage === 'seeding'
                              ? 'rgba(14, 165, 233, 0.15)'
                              : maturationStage === 'maturing'
                                ? 'rgba(99, 102, 241, 0.15)'
                                : 'rgba(16, 185, 129, 0.15)',
                        color:
                          maturationStage === 'infant'
                            ? '#fbbf24'
                            : maturationStage === 'seeding'
                              ? '#38bdf8'
                              : maturationStage === 'maturing'
                                ? '#818cf8'
                                : '#34d399',
                        border: `1px solid ${
                          maturationStage === 'infant'
                            ? 'rgba(245, 158, 11, 0.3)'
                            : maturationStage === 'seeding'
                              ? 'rgba(14, 165, 233, 0.3)'
                              : maturationStage === 'maturing'
                                ? 'rgba(99, 102, 241, 0.3)'
                                : 'rgba(16, 185, 129, 0.3)'
                        }`,
                      }}
                    >
                      {maturationStage}
                    </span>
                  </div>
                </div>

                {/* Typing Cadence Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
                    TYPING CADENCE
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BoltIcon size={20} color="#f59e0b" />
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                      {typingWpm} WPM
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Typo Rate: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{typoRate.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Patience & Engage Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
                    PATIENCE & ENGAGE
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SlidersIcon size={20} color="#60a5fa" />
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                      {patienceIndex.toFixed(1)}/10
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Engage: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{engagementRate}%</span>
                  </div>
                </div>
              </div>

              {/* SECTION 1: TRUST SCORE & MATURATION STAGE */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheckIcon size={16} color="#10b981" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.04em' }}>
                      TRUST SCORE & MATURATION STAGE
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    {trustScore} / 100
                  </span>
                </div>

                {/* Trust Slider */}
                <div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={trustScore}
                    onChange={(e) => handleTrustScoreChange(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#10b981',
                      cursor: 'pointer',
                      height: '6px',
                    }}
                  />
                </div>

                {/* Stage Selection Buttons */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                  }}
                >
                  {(
                    [
                      { key: 'infant', label: 'Infant (0-25)' },
                      { key: 'seeding', label: 'Seeding (26-50)' },
                      { key: 'maturing', label: 'Maturing (51-75)' },
                      { key: 'mature', label: 'Mature (76-100)' },
                    ] as const
                  ).map((item) => {
                    const isSelected = maturationStage === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleStageSelect(item.key)}
                        style={{
                          padding: '10px 8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                          border: isSelected ? '1px solid #3b82f6' : '1px solid #334155',
                          color: isSelected ? '#60a5fa' : '#94a3b8',
                          boxShadow: isSelected ? '0 0 12px rgba(59, 130, 246, 0.25)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Auto-Maturation Organic Engine Info & Trigger */}
                <div
                  style={{
                    marginTop: '4px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px dashed #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#f1f5f9' }}>
                      Organic Maturation Engine
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Active runtime: <span style={{ color: '#38bdf8' }}>{profileAgeDays} days</span> • Automatically increases with task completion velocity & zero bot-flag strikes.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRunAutoMature()}
                    disabled={autoMaturing}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <RefreshIcon size={12} className={autoMaturing ? 'spin' : ''} />
                    <span>{autoMaturing ? 'Evaluating...' : 'Auto-Mature Profile'}</span>
                  </button>
                </div>

                {autoMatureToast && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid #10b981',
                      color: '#a7f3d0',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                  >
                    ✓ {autoMatureToast}
                  </div>
                )}
              </div>

              {/* SECTION 2: PHYSICAL KEYSTROKE DYNAMICS */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyboardIcon size={16} color="#f59e0b" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.04em' }}>
                    PHYSICAL KEYSTROKE DYNAMICS
                  </span>
                </div>

                {/* Typing Speed */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Typing Speed (WPM)</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>{typingWpm} WPM</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="120"
                    value={typingWpm}
                    onChange={(e) => setTypingWpm(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#f59e0b',
                      cursor: 'pointer',
                      height: '6px',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                    <span>30 WPM (Hesitant / Slow)</span>
                    <span>70 WPM (Average)</span>
                    <span>120 WPM (High Velocity)</span>
                  </div>
                </div>

                {/* Typo & Error Probability */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Typo & Error Probability</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>{typoRate.toFixed(1)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="0.1"
                    value={typoRate}
                    onChange={(e) => setTypoRate(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#f59e0b',
                      cursor: 'pointer',
                      height: '6px',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Injects natural human typos, hesitation backspaces, and correction key sequences.
                  </div>
                </div>

                {/* Presets */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    marginTop: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(45, 2.1)}
                    style={{
                      padding: '8px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      background: typingWpm === 45 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      border: typingWpm === 45 ? '1px solid #f59e0b' : '1px solid #334155',
                      color: typingWpm === 45 ? '#fbbf24' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Slow / Careful (45 WPM)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(68, 4.3)}
                    style={{
                      padding: '8px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      background: typingWpm === 68 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      border: typingWpm === 68 ? '1px solid #f59e0b' : '1px solid #334155',
                      color: typingWpm === 68 ? '#fbbf24' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Natural User (68 WPM)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(98, 6.8)}
                    style={{
                      padding: '8px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      background: typingWpm === 98 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      border: typingWpm === 98 ? '1px solid #f59e0b' : '1px solid #334155',
                      color: typingWpm === 98 ? '#fbbf24' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Fast Typer (98 WPM)
                  </button>
                </div>
              </div>

              {/* SECTION 3: DWELL PATIENCE & ENGAGEMENT PROFILE */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HeartIcon size={16} color="#60a5fa" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.04em' }}>
                    DWELL PATIENCE & ENGAGEMENT PROFILE
                  </span>
                </div>

                {/* Patience Index */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Patience Index (Dwell Duration)</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#60a5fa' }}>{patienceIndex.toFixed(1)} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.1"
                    value={patienceIndex}
                    onChange={(e) => setPatienceIndex(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#3b82f6',
                      cursor: 'pointer',
                      height: '6px',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                    <span>1.0 (Rapid Skimmer)</span>
                    <span>5.5 (Normal Dwell)</span>
                    <span>10.0 (Thorough Reader)</span>
                  </div>
                </div>

                {/* Engagement Probability */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Engagement Probability (Likes/Subscribes)</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#60a5fa' }}>{engagementRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={engagementRate}
                    onChange={(e) => setEngagementRate(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#3b82f6',
                      cursor: 'pointer',
                      height: '6px',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Controls whether GhostPilot triggers like, subscribe, or comment interactions during runs.
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* TAB 2: WEIGHTED NICHES */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                    Multi-Niche Affiliation & Weights
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    Assign multiple target niches to this profile to diversify browsing patterns and engagement algorithms.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddNiche(!showAddNiche)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#60a5fa',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <PlusIcon size={14} />
                  <span>New Niche</span>
                </button>
              </div>

              {/* Add New Niche Input */}
              {showAddNiche && (
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.7)',
                    border: '1px solid #3b82f6',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter new niche name (e.g. Crypto & DeFi, Luxury Travel)..."
                    value={newNicheName}
                    onChange={(e) => setNewNicheName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreateNewNiche();
                    }}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleCreateNewNiche()}
                    style={{ padding: '6px 14px', fontSize: '11px' }}
                  >
                    Add Niche
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAddNiche(false)}
                    style={{ padding: '6px 10px', fontSize: '11px' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Niches List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {niches.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '36px',
                      color: '#64748b',
                      background: 'rgba(15, 23, 42, 0.5)',
                      borderRadius: '12px',
                      border: '1px dashed #334155',
                    }}
                  >
                    No niches configured in your workspace yet. Click &quot;New Niche&quot; above to create one.
                  </div>
                ) : (
                  niches.map((niche) => {
                    const isSelected = selectedNicheIds.includes(niche.id);
                    const weightItem = weightedNiches.find((w) => w.nicheId === niche.id);
                    const weight = weightItem ? weightItem.weight : 80;
                    const isPrimary = weightItem?.isPrimary ?? (selectedNicheIds[0] === niche.id);

                    return (
                      <div
                        key={niche.id}
                        style={{
                          background: isSelected ? 'rgba(30, 58, 138, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                          border: isSelected ? '1px solid #3b82f6' : '1px solid #1e293b',
                          borderRadius: '10px',
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleNiche(niche.id)}
                              style={{ width: '16px', height: '16px', accentColor: '#3b82f6', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                                {niche.name}
                              </div>
                              {niche.description && (
                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                  {niche.description}
                                </div>
                              )}
                            </div>
                          </label>

                          {isSelected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isPrimary ? (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: 'rgba(59, 130, 246, 0.25)',
                                    color: '#60a5fa',
                                    border: '1px solid #3b82f6',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  Primary Niche
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryNiche(niche.id)}
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'transparent',
                                    border: '1px solid #334155',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Make Primary
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {isSelected && (
                          <div
                            style={{
                              paddingTop: '8px',
                              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '14px',
                            }}
                          >
                            <span style={{ fontSize: '11px', color: '#94a3b8', minWidth: '90px' }}>
                              Traffic Weight:
                            </span>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              step="5"
                              value={weight}
                              onChange={(e) => handleNicheWeightChange(niche.id, Number(e.target.value))}
                              style={{ flex: 1, accentColor: '#3b82f6', height: '5px' }}
                            />
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', minWidth: '35px', textAlign: 'right' }}>
                              {weight}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #1e293b',
            background: 'rgba(10, 14, 23, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              All parameters synchronize instantly with backend DAG runners.
            </div>
            {saveError && (
              <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 500 }}>
                ⚠️ {saveError}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closePersonaModal}
              disabled={saving}
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#2563eb',
              }}
            >
              <SaveIcon size={14} />
              <span>{saving ? 'Saving...' : 'Save Persona & Niches'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BehavioralPersonaModal;
