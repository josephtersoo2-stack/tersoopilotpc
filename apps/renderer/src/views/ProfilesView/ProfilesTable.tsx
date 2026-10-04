import { useState } from 'react';

import {
  AndroidIcon,
  AppleIcon,
  BoltIcon,
  CopyIcon,
  DeviceDesktopIcon,
  DeviceMobileIcon,
  DuplicateIcon,
  ExternalLinkIcon,
  LinuxIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlayIcon,
  RefreshIcon,
  ShieldCheckIcon,
  StopIcon,
  TrashIcon,
  UnlockIcon,
  WindowsIcon,
} from '../../components/icons';
import { formatUptime } from '../../lib/formatters';
import { useProfilesStore, type SortField } from '../../stores/profilesStore';
import { useNichesStore } from '../../stores/nichesStore';

export function ProfilesTable() {
  const {
    profiles,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    inspectProfile,
    launchProfile,
    stopProfile,
    deleteProfile,
    cloneProfile,
    openEditModal,
    openPersonaModal,
    currentPage,
    pageSize,
    setPage,
    setPageSize,
    setTagFilter,
    loading,
    viewMode,
    sortField,
    sortDirection,
    setSorting,
  } = useProfilesStore();
  const { niches } = useNichesStore();

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Pagination slice
  const startIndex = (currentPage - 1) * pageSize;
  const currentProfiles = profiles.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.max(1, Math.ceil(profiles.length / pageSize));
  const allPageSelected =
    currentProfiles.length > 0 && currentProfiles.every((p) => selectedIds.has(p.id));

  const getPersonaBadge = (personaKey?: string) => {
    switch (personaKey) {
      case 'gamer':
        return { label: '⚡ Gamer', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.3)' };
      case 'researcher':
        return { label: '🔬 Researcher', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)' };
      case 'skimmer':
        return { label: '⏩ Skimmer', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
      default:
        return { label: '🛋️ Casual', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
    }
  };

  const getMaturationBadge = (stage?: string, score?: number) => {
    const s = stage ?? (score !== undefined ? (score <= 25 ? 'infant' : score <= 50 ? 'seeding' : score <= 75 ? 'maturing' : 'mature') : 'infant');
    const sc = score ?? (s === 'infant' ? 10 : s === 'seeding' ? 35 : s === 'maturing' ? 60 : 85);
    switch (s) {
      case 'seeding':
        return { label: `SEEDING (${sc})`, color: '#38bdf8', bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.3)' };
      case 'maturing':
        return { label: `MATURING (${sc})`, color: '#818cf8', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.3)' };
      case 'mature':
        return { label: `MATURE (${sc})`, color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'infant':
      default:
        return { label: `INFANT (${sc})`, color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'windows':
        return <WindowsIcon size={16} color="#00a4ef" />;
      case 'macos':
      case 'ios':
        return <AppleIcon size={16} color="#ffffff" />;
      case 'android':
        return <AndroidIcon size={16} color="#3ddc84" />;
      case 'linux':
        return <LinuxIcon size={16} color="#f59e0b" />;
      default:
        return <DeviceDesktopIcon size={16} color="#94a3b8" />;
    }
  };

  const getDeviceIcon = (platform: string) => {
    if (platform === 'android' || platform === 'ios') {
      return <DeviceMobileIcon size={18} color="#818cf8" />;
    }
    return <DeviceDesktopIcon size={18} color="#60a5fa" />;
  };

  const getCleanGpuLabel = (renderer?: string, platform?: string) => {
    if (!renderer) {
      if (platform === 'android') return 'Mobile GPU';
      if (platform === 'macos') return 'Apple Silicon';
      return 'Direct3D11 GPU';
    }
    return renderer
      .replace(/ANGLE \([^,]+, ([^,]+).*\)/, '')
      .replace(/^[A-Za-z0-9\s.]+ \/ /, '')
      .replace(/^NVIDIA GeForce /, '')
      .replace(/^Qualcomm /, '')
      .replace(/^ARM /, '')
      .trim();
  };

  const getOsLabel = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'windows':
        return 'Windows 11';
      case 'macos':
        return 'macOS 14';
      case 'android':
        return 'Android 14';
      case 'ios':
        return 'iOS 17';
      case 'linux':
        return 'Ubuntu 22.04';
      default:
        return platform;
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return <span style={{ marginLeft: '4px', color: '#60a5fa' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const handleCopyJson = (profileId: string) => {
    const target = profiles.find((p) => p.id === profileId);
    if (target) {
      void navigator.clipboard.writeText(JSON.stringify(target, null, 2));
    }
    setActiveMenuId(null);
  };

  return (
    <div
      className="glass-panel"
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* GRID VIEW */}
      {viewMode === 'grid' ? (
        <div style={{ padding: '16px', overflowY: 'auto' }}>
          {loading && profiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              Loading profiles...
            </div>
          ) : currentProfiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              No profiles match the filter criteria.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '14px',
              }}
            >
              {currentProfiles.map((profile) => {
                const isSelected = selectedIds.has(profile.id);
                const isRunning = profile.state === 'running';
                const isStarting = (profile.state as string) === 'starting';
                const isCrashed = profile.state === 'crashed';

                return (
                  <div
                    key={profile.id}
                    className="glass-panel"
                    style={{
                      padding: '14px',
                      background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                      border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-card)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                    onClick={() => void inspectProfile(profile.id)}
                  >
                    {/* Card Top Row: Checkbox, Name, Status */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(profile.id)}
                            style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                          />
                        </div>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {getDeviceIcon(profile.platform)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '13px' }}>
                            {profile.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                            {getOsLabel(profile.platform)} · {getCleanGpuLabel(profile.webglRenderer, profile.platform)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {(() => {
                              const personaBadge = getPersonaBadge(profile.persona);
                              const matBadge = getMaturationBadge(profile.maturationStage, profile.trustScore);
                              const assignedNicheIds = profile.nicheIds && profile.nicheIds.length > 0
                                ? profile.nicheIds
                                : profile.nicheId
                                  ? [profile.nicheId]
                                  : [];
                              const assignedNiches = niches.filter((n) => assignedNicheIds.includes(n.id));

                              return (
                                <>
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPersonaModal(profile.id);
                                    }}
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: 600,
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      background: personaBadge.bg,
                                      color: personaBadge.color,
                                      border: `1px solid ${personaBadge.border}`,
                                      cursor: 'pointer',
                                    }}
                                    title="Click to edit Behavioral Persona & Niches"
                                  >
                                    {personaBadge.label}
                                  </span>

                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPersonaModal(profile.id);
                                    }}
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      background: matBadge.bg,
                                      color: matBadge.color,
                                      border: `1px solid ${matBadge.border}`,
                                      cursor: 'pointer',
                                    }}
                                    title="Trust Score & Maturation Stage - Click to edit"
                                  >
                                    🛡 {matBadge.label}
                                  </span>

                                  {assignedNiches.slice(0, 2).map((n) => (
                                    <span
                                      key={n.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPersonaModal(profile.id);
                                      }}
                                      style={{
                                        fontSize: '9px',
                                        fontWeight: 600,
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        color: '#a5b4fc',
                                        border: '1px solid rgba(99, 102, 241, 0.3)',
                                        cursor: 'pointer',
                                      }}
                                      title="Profile Niche - Click to configure multi-niches"
                                    >
                                      📂 {n.name}
                                    </span>
                                  ))}
                                  {assignedNiches.length > 2 && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPersonaModal(profile.id);
                                      }}
                                      style={{
                                        fontSize: '9px',
                                        fontWeight: 600,
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        color: '#cbd5e1',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        cursor: 'pointer',
                                      }}
                                      title={`${assignedNiches.length} total niches assigned`}
                                    >
                                      +{assignedNiches.length - 2}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* State & Engine Badges */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: profile.engine === 'camoufox' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: profile.engine === 'camoufox' ? '#fb923c' : '#60a5fa',
                            border: `1px solid ${profile.engine === 'camoufox' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {profile.engine ?? 'apostate'}
                        </span>
                        {isRunning && (
                          <span className="badge badge-running">
                            <span className="status-dot online pulse" style={{ width: '6px', height: '6px' }} />
                            <span>RUNNING</span>
                          </span>
                        )}
                        {isStarting && (
                          <span className="badge badge-starting">
                            <span>STARTING</span>
                          </span>
                        )}
                        {profile.state === 'idle' && (
                          <span className="badge badge-idle">
                            <span>IDLE</span>
                          </span>
                        )}
                        {isCrashed && (
                          <span className="badge badge-crashed">
                            <span>CRASHED</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {profile.tags && profile.tags.length > 0 ? (
                        profile.tags.map((tag) => (
                          <span
                            key={tag}
                            className="badge badge-tag"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTagFilter(tag.replace(/^#/, ''));
                            }}
                          >
                            #{tag.replace(/^#/, '')}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>#default</span>
                      )}
                    </div>

                    {/* Middle Details: Proxy & Fingerprint */}
                    <div
                      style={{
                        padding: '8px 10px',
                        background: 'rgba(0, 0, 0, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Proxy</span>
                        <span style={{ color: profile.proxyId ? '#60a5fa' : 'var(--text-dim)', fontWeight: 500 }}>
                          {profile.proxyId ? `Dedicated (${profile.proxyId.slice(0, 8)})` : 'Auto-assign'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Coherence</span>
                        <span style={{ color: '#34d399', fontWeight: 600 }}>0.98 (Clear)</span>
                      </div>
                      {isRunning && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                          <span>Uptime</span>
                          <span style={{ color: 'var(--text-main)' }}>{formatUptime(profile.lastLaunchedAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '4px',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                        onClick={() => void inspectProfile(profile.id)}
                      >
                        Inspect
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isRunning ? (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '11px', color: '#f43f5e' }}
                            onClick={() => void stopProfile(profile.id)}
                            title="Stop Profile"
                          >
                            <StopIcon size={10} />
                            <span>Stop</span>
                          </button>
                        ) : isCrashed ? (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => void launchProfile(profile.id)}
                            title="Retry Launch"
                          >
                            <RefreshIcon size={10} />
                            <span>Retry</span>
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 12px', fontSize: '11px' }}
                            onClick={() => void launchProfile(profile.id)}
                            title="Launch Profile"
                          >
                            <PlayIcon size={10} />
                            <span>Run</span>
                          </button>
                        )}

                        <div style={{ position: 'relative' }}>
                          <button
                            className="btn-icon"
                            style={{ padding: '4px' }}
                            onClick={() => setActiveMenuId(activeMenuId === profile.id ? null : profile.id)}
                            title="More Profile Options"
                          >
                            <MoreHorizontalIcon size={14} />
                          </button>

                          {activeMenuId === profile.id && (
                            <div
                              className="glass-panel animate-fade-in"
                              style={{
                                position: 'absolute',
                                bottom: '32px',
                                right: '0',
                                width: '180px',
                                padding: '4px',
                                zIndex: 60,
                                background: '#0f172a',
                                boxShadow: 'var(--shadow-lg)',
                                border: '1px solid var(--border-card-highlight)',
                              }}
                            >
                              <button
                                onClick={() => {
                                  void inspectProfile(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <ExternalLinkIcon size={11} />
                                <span>Inspect Details</span>
                              </button>

                              <button
                                onClick={() => {
                                  openEditModal(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <RefreshIcon size={11} />
                                <span>Edit Profile</span>
                              </button>

                              <button
                                onClick={() => {
                                  openPersonaModal(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <BoltIcon size={11} color="#60a5fa" />
                                <span>Behavioral Persona & Niches</span>
                              </button>

                              <button
                                onClick={() => {
                                  void cloneProfile(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <DuplicateIcon size={11} />
                                <span>Duplicate Persona</span>
                              </button>

                              <button
                                onClick={() => handleCopyJson(profile.id)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <CopyIcon size={11} />
                                <span>Copy JSON</span>
                              </button>

                              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

                              <button
                                onClick={() => {
                                  void deleteProfile(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#f43f5e',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <TrashIcon size={11} />
                                <span>Delete Profile</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW */
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-card)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: 'var(--text-dim)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ width: '40px', padding: '12px 16px' }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                  />
                </th>
                <th
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSorting('name')}
                >
                  Name / Persona {renderSortIndicator('name')}
                </th>
                <th
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSorting('platform')}
                >
                  Platform {renderSortIndicator('platform')}
                </th>
                <th
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSorting('engine')}
                >
                  Engine {renderSortIndicator('engine')}
                </th>
                <th style={{ padding: '12px 16px' }}>Sticky Proxy</th>
                <th style={{ padding: '12px 16px' }}>Fingerprint</th>
                <th
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSorting('state')}
                >
                  State {renderSortIndicator('state')}
                </th>
                <th
                  style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setSorting('lastLaunchedAt')}
                >
                  Uptime {renderSortIndicator('lastLaunchedAt')}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && profiles.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                    Loading profiles...
                  </td>
                </tr>
              ) : currentProfiles.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                    No profiles match the filter criteria.
                  </td>
                </tr>
              ) : (
                currentProfiles.map((profile) => {
                  const isSelected = selectedIds.has(profile.id);
                  const isRunning = profile.state === 'running';
                  const isStarting = (profile.state as string) === 'starting';
                  const isCrashed = profile.state === 'crashed';
                  const isIdle =
                    profile.state === 'idle' || profile.state === 'paused' || profile.state === 'archived';

                  return (
                    <tr
                      key={profile.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        transition: 'background var(--transition-fast)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                      onClick={() => void inspectProfile(profile.id)}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(profile.id)}
                          style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                        />
                      </td>

                      {/* Name / Persona */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-subtle)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {getDeviceIcon(profile.platform)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '13px' }}>
                              {profile.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {(() => {
                                const personaBadge = getPersonaBadge(profile.persona);
                                const matBadge = getMaturationBadge(profile.maturationStage, profile.trustScore);
                                const assignedNicheIds = profile.nicheIds && profile.nicheIds.length > 0
                                  ? profile.nicheIds
                                  : profile.nicheId
                                    ? [profile.nicheId]
                                    : [];
                                const assignedNiches = niches.filter((n) => assignedNicheIds.includes(n.id));

                                return (
                                  <>
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPersonaModal(profile.id);
                                      }}
                                      style={{
                                        fontSize: '9px',
                                        fontWeight: 600,
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: personaBadge.bg,
                                        color: personaBadge.color,
                                        border: `1px solid ${personaBadge.border}`,
                                        cursor: 'pointer',
                                      }}
                                      title="Click to edit Behavioral Persona & Niches"
                                    >
                                      {personaBadge.label}
                                    </span>

                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPersonaModal(profile.id);
                                      }}
                                      style={{
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: matBadge.bg,
                                        color: matBadge.color,
                                        border: `1px solid ${matBadge.border}`,
                                        cursor: 'pointer',
                                      }}
                                      title="Trust Score & Maturation Stage - Click to edit"
                                    >
                                      🛡 {matBadge.label}
                                    </span>

                                    {assignedNiches.slice(0, 2).map((n) => (
                                      <span
                                        key={n.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openPersonaModal(profile.id);
                                        }}
                                        style={{
                                          fontSize: '9px',
                                          fontWeight: 600,
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          background: 'rgba(99, 102, 241, 0.15)',
                                          color: '#a5b4fc',
                                          border: '1px solid rgba(99, 102, 241, 0.3)',
                                          cursor: 'pointer',
                                        }}
                                        title="Profile Niche - Click to configure multi-niches"
                                      >
                                        📂 {n.name}
                                      </span>
                                    ))}
                                    {assignedNiches.length > 2 && (
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openPersonaModal(profile.id);
                                        }}
                                        style={{
                                          fontSize: '9px',
                                          fontWeight: 600,
                                          padding: '1px 4px',
                                          borderRadius: '3px',
                                          background: 'rgba(255, 255, 255, 0.08)',
                                          color: '#cbd5e1',
                                          border: '1px solid rgba(255, 255, 255, 0.15)',
                                          cursor: 'pointer',
                                        }}
                                        title={`${assignedNiches.length} total niches assigned`}
                                      >
                                        +{assignedNiches.length - 2}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                              {profile.tags && profile.tags.length > 0 ? (
                                profile.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="badge badge-tag"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTagFilter(tag.replace(/^#/, ''));
                                    }}
                                  >
                                    #{tag.replace(/^#/, '')}
                                  </span>
                                ))
                              ) : (
                                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>#default</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Platform */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {getPlatformIcon(profile.platform)}
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: 'var(--text-main)', fontSize: '12px', fontWeight: 500 }}>
                              {getOsLabel(profile.platform)}
                            </span>
                            <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                              {getCleanGpuLabel(profile.webglRenderer, profile.platform)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Engine */}
                      <td style={{ padding: '12px 16px' }}>
                        {profile.engine === 'camoufox' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'rgba(249, 115, 22, 0.15)',
                              color: '#fb923c',
                              border: '1px solid rgba(249, 115, 22, 0.3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Camoufox
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Apostate
                          </span>
                        )}
                      </td>

                      {/* Sticky Proxy */}
                      <td style={{ padding: '12px 16px' }}>
                        {profile.proxyId ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, color: '#60a5fa' }}>
                              <span>Dedicated Proxy</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                                ({profile.proxyId.slice(0, 8)})
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '10px',
                                  color: '#f59e0b',
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                }}
                              >
                                <LockIcon size={10} />
                                <span>Locked (Lease #{profile.proxyId.slice(0, 4)})</span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-assign on start</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#10b981' }}>
                              <UnlockIcon size={10} />
                              <span>Unlocked</span>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Fingerprint Coherence Score */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#ffffff' }}>0.98</span>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              color: '#34d399',
                              background: 'rgba(16, 185, 129, 0.15)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            Clear
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          76ms
                        </div>
                      </td>

                      {/* State Badge */}
                      <td style={{ padding: '12px 16px' }}>
                        {isRunning && (
                          <span className="badge badge-running">
                            <span className="status-dot online pulse" style={{ width: '6px', height: '6px' }} />
                            <span>RUNNING</span>
                          </span>
                        )}
                        {isStarting && (
                          <span className="badge badge-starting">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                            <span>STARTING</span>
                          </span>
                        )}
                        {isIdle && (
                          <span className="badge badge-idle">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} />
                            <span>IDLE</span>
                          </span>
                        )}
                        {isCrashed && (
                          <span className="badge badge-crashed">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f43f5e' }} />
                            <span>CRASHED</span>
                          </span>
                        )}
                      </td>

                      {/* Uptime */}
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                        {isRunning ? (
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                              {formatUptime(profile.lastLaunchedAt)}
                            </div>
                          </div>
                        ) : isCrashed ? (
                          <div>
                            <span>-</span>
                            <div style={{ fontSize: '10px', color: '#f43f5e' }}>Exited</div>
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        style={{ padding: '12px 16px', textAlign: 'right' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                          {isRunning ? (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', color: '#f43f5e' }}
                              onClick={() => void stopProfile(profile.id)}
                              title="Stop Profile"
                            >
                              <StopIcon size={10} />
                              <span>Stop</span>
                            </button>
                          ) : isCrashed ? (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => void launchProfile(profile.id)}
                              title="Retry Launch"
                            >
                              <RefreshIcon size={11} />
                              <span>Retry</span>
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                              onClick={() => void launchProfile(profile.id)}
                              title="Launch Profile"
                            >
                              <PlayIcon size={10} />
                              <span>Run</span>
                            </button>
                          )}

                          {/* More menu button */}
                          <button
                            className="btn-icon"
                            style={{ padding: '4px' }}
                            onClick={() => setActiveMenuId(activeMenuId === profile.id ? null : profile.id)}
                            title="More Profile Options"
                          >
                            <MoreHorizontalIcon size={14} />
                          </button>

                          {/* Dropdown Menu */}
                          {activeMenuId === profile.id && (
                            <div
                              className="glass-panel animate-fade-in"
                              style={{
                                position: 'absolute',
                                top: '28px',
                                right: '0',
                                width: '160px',
                                padding: '4px',
                                zIndex: 60,
                                background: '#0f172a',
                                boxShadow: 'var(--shadow-lg)',
                                border: '1px solid var(--border-card-highlight)',
                              }}
                            >
                              <button
                                onClick={() => {
                                  void inspectProfile(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <ExternalLinkIcon size={11} />
                                <span>Inspect Details</span>
                              </button>

                              <button
                                onClick={() => {
                                  openEditModal(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <RefreshIcon size={11} />
                                <span>Edit Profile</span>
                              </button>

                              <button
                                onClick={() => {
                                  openPersonaModal(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <BoltIcon size={11} color="#60a5fa" />
                                <span>Behavioral Persona & Niches</span>
                              </button>

                              <button
                                onClick={() => {
                                  void cloneProfile(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <DuplicateIcon size={11} />
                                <span>Duplicate Persona</span>
                              </button>

                              <button
                                onClick={() => handleCopyJson(profile.id)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-main)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <CopyIcon size={11} />
                                <span>Copy JSON</span>
                              </button>

                              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

                              <button
                                onClick={() => {
                                  void deleteProfile(profile.id);
                                  setActiveMenuId(null);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#f43f5e',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              >
                                <TrashIcon size={11} />
                                <span>Delete Profile</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: '1px solid var(--border-card)',
          fontSize: '11px',
          color: 'var(--text-dim)',
          background: 'rgba(15, 23, 42, 0.5)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            Showing {profiles.length === 0 ? 0 : startIndex + 1}-
            {Math.min(startIndex + pageSize, profiles.length)} of {profiles.length} profiles
          </div>

          {/* Page size selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Per page:</span>
            <select
              className="select"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ padding: '2px 18px 2px 6px', fontSize: '10px' }}
            >
              <option value={8}>8</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '10px' }}
            disabled={currentPage <= 1}
            onClick={() => setPage(Math.max(1, currentPage - 1))}
          >
            &lt; Previous
          </button>

          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isCurrent = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  border: isCurrent ? '1px solid var(--color-primary)' : '1px solid transparent',
                  background: isCurrent ? 'var(--color-primary)' : 'transparent',
                  color: isCurrent ? '#ffffff' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '10px' }}
            disabled={currentPage >= totalPages}
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          >
            Next &gt;
          </button>
        </div>
      </div>
    </div>
  );
}
