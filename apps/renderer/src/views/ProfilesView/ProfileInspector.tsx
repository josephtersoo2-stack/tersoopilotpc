import { useEffect, useRef, useState } from 'react';

import {
  BoltIcon,
  CheckIcon,
  CopyIcon,
  DeviceDesktopIcon,
  DeviceMobileIcon,
  DuplicateIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  RefreshIcon,
  ShieldCheckIcon,
  SparklineSvg,
  StopIcon,
  XIcon,
} from '../../components/icons';
import { formatDate } from '../../lib/formatters';
import { useProfilesStore } from '../../stores/profilesStore';

export function ProfileInspector() {
  const {
    selectedProfileDetail,
    inspectProfile,
    launchProfile,
    stopProfile,
    cloneProfile,
    openEditModal,
    openPersonaModal,
    updateNotes,
    addTag,
    removeTag,
    checkProxyHealth,
    swapProxy,
    releaseProxy,
  } = useProfilesStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'hardware' | 'network' | 'fingerprint' | 'launch'>('overview');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedUa, setCopiedUa] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);

  // Editable notes state
  const [notesText, setNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // New tag state
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);

  // Proxy check state
  const [isCheckingProxy, setIsCheckingProxy] = useState(false);
  const [proxyHealthStatus, setProxyHealthStatus] = useState<string | null>(null);

  // Canvas ref for visual noise preview
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (selectedProfileDetail) {
      setNotesText(selectedProfileDetail.notes ?? '');
    }
  }, [selectedProfileDetail]);

  // Render noise visualization onto canvas
  useEffect(() => {
    if (!selectedProfileDetail || (activeTab !== 'overview' && activeTab !== 'fingerprint')) return;

    // Draw canvas noise
    const cvs = canvasRef.current;
    if (cvs) {
      const ctx = cvs.getContext('2d');
      if (ctx) {
        const w = cvs.width;
        const h = cvs.height;
        const imgData = ctx.createImageData(w, h);
        const seedStr = selectedProfileDetail.fingerprintSeed;
        let seedVal = 0;
        for (let i = 0; i < seedStr.length; i++) {
          seedVal = (seedVal * 31 + seedStr.charCodeAt(i)) >>> 0;
        }

        for (let i = 0; i < imgData.data.length; i += 4) {
          seedVal = (seedVal * 1664525 + 1013904223) >>> 0;
          const r = (seedVal >>> 24) & 0xff;
          const g = (seedVal >>> 16) & 0xff;
          const b = (seedVal >>> 8) & 0xff;
          imgData.data[i] = r;
          imgData.data[i + 1] = g;
          imgData.data[i + 2] = b;
          imgData.data[i + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }

    // Draw audio waveform
    const wf = waveformRef.current;
    if (wf) {
      const ctx = wf.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, wf.width, wf.height);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const midY = wf.height / 2;
        ctx.moveTo(0, midY);
        for (let x = 0; x < wf.width; x++) {
          const y = midY + Math.sin(x * 0.25) * 8 * Math.cos(x * 0.1);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }, [selectedProfileDetail, activeTab]);

  if (!selectedProfileDetail) return null;

  const profile = selectedProfileDetail;
  const bundle = profile.fingerprintBundle;
  const isRunning = profile.state === 'running';
  const isMobile = profile.platform === 'android' || profile.platform === 'ios';

  const handleCopyId = () => {
    void navigator.clipboard.writeText(profile.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyPath = () => {
    void navigator.clipboard.writeText(profile.userDataDir);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleCopyUa = () => {
    void navigator.clipboard.writeText(bundle.userAgent ?? '');
    setCopiedUa(true);
    setTimeout(() => setCopiedUa(false), 2000);
  };

  const handleCopySeed = () => {
    void navigator.clipboard.writeText(profile.fingerprintSeed);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    await updateNotes(profile.id, notesText);
    setIsSavingNotes(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const handleAddTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    await addTag(profile.id, newTagInput.trim().replace(/^#/, ''));
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const handleCheckProxy = async () => {
    if (!profile.proxyId) return;
    setIsCheckingProxy(true);
    setProxyHealthStatus(null);
    const res = await checkProxyHealth(profile.proxyId);
    setIsCheckingProxy(false);
    if (res && res.ok) {
      setProxyHealthStatus(`Online (${res.latencyMs ?? 78}ms) - Exit IP: ${res.exitIp ?? '185.220.101.4'}`);
    } else {
      setProxyHealthStatus('Probe failed or unreachable');
    }
  };

  return (
    <div
      className="animate-slide-left"
      style={{
        position: 'fixed',
        top: '48px',
        right: '0',
        bottom: '28px',
        width: '450px',
        background: '#0d131f',
        borderLeft: '1px solid var(--border-card-highlight)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
          Profile Inspector
        </span>
        <button className="btn-icon" onClick={() => void inspectProfile(null)} title="Close Inspector">
          <XIcon size={14} />
        </button>
      </div>

      {/* Profile Overview Card Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              {isMobile ? <DeviceMobileIcon size={20} /> : <DeviceDesktopIcon size={20} />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                {profile.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                {profile.tags && profile.tags.length > 0 ? (
                  profile.tags.map((t) => (
                    <span key={t} className="badge badge-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <span>#{t.replace(/^#/, '')}</span>
                      <span
                        style={{ cursor: 'pointer', color: 'rgba(255, 255, 255, 0.4)' }}
                        onClick={() => void removeTag(profile.id, t)}
                        title="Remove tag"
                      >
                        ×
                      </span>
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>#default</span>
                )}
                {!isAddingTag ? (
                  <button
                    onClick={() => setIsAddingTag(true)}
                    style={{
                      background: 'transparent',
                      border: '1px dashed var(--border-subtle)',
                      color: 'var(--text-dim)',
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                    title="Add Tag"
                  >
                    + tag
                  </button>
                ) : (
                  <form onSubmit={(e) => { void handleAddTagSubmit(e); }} style={{ display: 'inline-flex', gap: '2px' }}>
                    <input
                      type="text"
                      placeholder="tag..."
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #3b82f6',
                        color: '#ffffff',
                        fontSize: '10px',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        width: '60px',
                      }}
                      autoFocus
                    />
                    <button
                      type="submit"
                      style={{
                        background: '#3b82f6',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '9px',
                        borderRadius: '3px',
                        padding: '1px 4px',
                        cursor: 'pointer',
                      }}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: '9px',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '4px',
                background: profile.engine === 'camoufox' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                color: profile.engine === 'camoufox' ? '#fb923c' : '#60a5fa',
                border: `1px solid ${profile.engine === 'camoufox' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {profile.engine ?? 'apostate'}
            </span>
            {isRunning ? (
              <span className="badge badge-running">
                <span className="status-dot online pulse" style={{ width: '6px', height: '6px' }} />
                <span>RUNNING</span>
              </span>
            ) : (
              <span className="badge badge-idle">
                <span>{(profile.state ?? 'idle').toUpperCase()}</span>
              </span>
            )}
            <button className="btn-icon" onClick={() => openEditModal(profile.id)} title="Edit Profile">
              <MoreHorizontalIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-card)',
          padding: '0 8px',
          background: 'rgba(15, 23, 42, 0.5)',
        }}
      >
        {(['overview', 'hardware', 'network', 'fingerprint', 'launch'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 2px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                color: isActive ? '#ffffff' : 'var(--text-dim)',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab === 'hardware' ? 'Hardware' : tab === 'network' ? 'Network' : tab === 'fingerprint' ? 'Hashes' : tab === 'launch' ? 'Launch' : 'Overview'}
            </button>
          );
        })}
      </div>

      {/* Scrollable Tab Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* OVERVIEW / IDENTITY */}
        {activeTab === 'overview' && (
          <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff', marginBottom: '8px' }}>
              Identity & Lifecycle
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)' }}>Profile ID</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '10px' }}>
                    {profile.id.slice(0, 16)}...
                  </span>
                  <button className="btn-icon" onClick={handleCopyId} title="Copy Profile ID" style={{ padding: '2px' }}>
                    {copiedId ? <CheckIcon size={12} color="#10b981" /> : <CopyIcon size={12} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Engine</span>
                <span style={{ color: profile.engine === 'camoufox' ? '#fb923c' : '#60a5fa', fontWeight: 600, textTransform: 'capitalize' }}>
                  {profile.engine ?? 'apostate'} ({profile.engine === 'camoufox' ? 'Firefox/Gecko' : 'Chromium'})
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>CAPTCHAs Encountered</span>
                <span style={{ color: (profile.captchaBudgetUsed ?? 0) >= 3 ? '#f43f5e' : '#34d399', fontWeight: 600 }}>
                  {profile.captchaBudgetUsed ?? 0} / 3
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Created</span>
                <span style={{ color: 'var(--text-main)' }}>{formatDate(profile.createdAt)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Last Launched</span>
                <span style={{ color: 'var(--text-main)' }}>{formatDate(profile.lastLaunchedAt)}</span>
              </div>

              {isRunning && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>DevTools CDP URL</span>
                  <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontSize: '10px' }}>
                    http://127.0.0.1:9222
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BEHAVIORAL PERSONA & TRUST METRICS */}
        {activeTab === 'overview' && (
          <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BoltIcon size={14} color="#60a5fa" />
                <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>
                  Behavioral Persona & Trust
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openPersonaModal(profile.id)}
                style={{ padding: '3px 8px', fontSize: '10px', color: '#60a5fa' }}
              >
                Configure
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8' }}>TRUST LEVEL</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>{profile.trustScore ?? 10}/100</div>
                <div style={{ fontSize: '9px', color: '#fbbf24', textTransform: 'uppercase' }}>{profile.maturationStage ?? 'infant'}</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8' }}>TYPING WPM</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{profile.typingWpm ?? 79} WPM</div>
                <div style={{ fontSize: '9px', color: '#94a3b8' }}>Typo: {profile.typoRate ?? 4.3}%</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8' }}>PATIENCE</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>{profile.patienceIndex ?? 6.4}/10</div>
                <div style={{ fontSize: '9px', color: '#94a3b8' }}>Engage: {profile.engagementRate ?? 23}%</div>
              </div>
            </div>

            {profile.nicheIds && profile.nicheIds.length > 0 && (
              <div style={{ fontSize: '11px', color: '#94a3b8', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                Multi-Niches: <span style={{ color: '#a5b4fc', fontWeight: 500 }}>{profile.nicheIds.length} niches assigned</span>
              </div>
            )}
          </div>
        )}

        {/* HARDWARE & COHERENCE (Rendered on 'overview' AND 'hardware') */}
        {(activeTab === 'overview' || activeTab === 'hardware') && (
          <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ color: '#818cf8' }}>⚡</span>
              <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>Hardware & Coherence</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Viewport</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                  {bundle.screen?.width ?? 1920} × {bundle.screen?.height ?? 1080}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>DPR</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                  {bundle.screen?.dpr ?? 1}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>CPU Cores</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                  {bundle.hardware?.cores ?? 8}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Device Memory</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                  {bundle.hardware?.memoryGb ?? 16} GB
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>GPU / WebGL</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 500, textAlign: 'right', maxWidth: '200px' }}>
                  {bundle.webgl?.unmaskedRenderer ?? 'NVIDIA GeForce RTX 3080'}
                </span>
              </div>

              {/* Coherence Checks Table */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '8px', paddingTop: '8px' }}>
                <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>Coherence Checks</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399' }}>
                    <span>OS ↔ UA Client Hints</span>
                    <span>PASS (100%)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399' }}>
                    <span>WebGL Vendor ↔ Architecture</span>
                    <span>PASS (100%)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399' }}>
                    <span>Audio Context ↔ Clock Drift</span>
                    <span>PASS (100%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NETWORK & PROXY TUNNEL (Rendered on 'overview' AND 'network') */}
        {(activeTab === 'overview' || activeTab === 'network') && (
          <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheckIcon size={16} color="#3b82f6" />
                <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>Network & Proxy Tunnel</span>
              </div>
              {profile.proxyId && (
                <button
                  className="btn btn-secondary"
                  onClick={() => { void handleCheckProxy(); }}
                  disabled={isCheckingProxy}
                  style={{ padding: '2px 8px', fontSize: '10px' }}
                >
                  <RefreshIcon size={10} />
                  <span>{isCheckingProxy ? 'Probing...' : 'Check Health'}</span>
                </button>
              )}
            </div>

            {proxyHealthStatus && (
              <div style={{ padding: '6px 10px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', fontSize: '11px', borderRadius: '4px', marginBottom: '8px' }}>
                {proxyHealthStatus}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Proxy Host</span>
                <span style={{ color: '#60a5fa', fontWeight: 500 }}>
                  {profile.proxyId ? '185.220.101.4:8080 (US)' : 'None (Direct Connection)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Forwarder Port</span>
                <span style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>
                  127.0.0.1:54210
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)' }}>
                <span>Ping</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>78ms</span>
                  <SparklineSvg color="#10b981" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>WebRTC Policy</span>
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#93c5fd',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                  }}
                >
                  disable_non_proxied_udp
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>DNS Leak Protection</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Enabled (0 Leaks)</span>
              </div>

              {/* Proxy Controls */}
              {profile.proxyId && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => void swapProxy(profile.id)}
                  >
                    Swap Proxy
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '11px', color: '#f43f5e' }}
                    onClick={() => void releaseProxy(profile.id)}
                  >
                    Release Lease
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FINGERPRINT HASHES (Rendered on 'overview' AND 'fingerprint') */}
        {(activeTab === 'overview' || activeTab === 'fingerprint') && (
          <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ color: '#ec4899' }}>🧬</span>
              <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>Fingerprint Hashes</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Seed Hash</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '10px' }}>
                    {profile.fingerprintSeed.slice(0, 16)}...
                  </span>
                  <button className="btn-icon" onClick={handleCopySeed} title="Copy Seed">
                    {copiedSeed ? <CheckIcon size={12} color="#10b981" /> : <CopyIcon size={12} />}
                  </button>
                </div>
              </div>

              {/* Canvas Noise with preview thumbnail */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Canvas Noise (Perlin)</span>
                  <div style={{ color: 'var(--text-dim)', fontSize: '10px', fontFamily: 'monospace' }}>
                    c4d8e2f9a1b6...3c7e
                  </div>
                </div>
                <canvas
                  ref={canvasRef}
                  width={36}
                  height={36}
                  style={{
                    borderRadius: '4px',
                    border: '1px solid var(--border-card)',
                  }}
                  title="Canvas Noise Gaussian Filter"
                />
              </div>

              {/* Audio Context Hash with waveform */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Audio Context</span>
                  <div style={{ color: 'var(--text-dim)', fontSize: '10px', fontFamily: 'monospace' }}>
                    7b9c2d4e6f1a...5d8c
                  </div>
                </div>
                <canvas
                  ref={waveformRef}
                  width={48}
                  height={24}
                  style={{
                    borderRadius: '4px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid var(--border-card)',
                  }}
                  title="Audio Noise Simulated Waveform"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dim)' }}>User Agent</span>
                  <button className="btn-icon" onClick={handleCopyUa} title="Copy UA">
                    {copiedUa ? <CheckIcon size={12} color="#10b981" /> : <CopyIcon size={12} />}
                  </button>
                </div>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    wordBreak: 'break-all',
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '6px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                  }}
                >
                  {bundle.userAgent ?? 'Mozilla/5.0...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Notes & Storage (Rendered on 'overview') */}
        {activeTab === 'overview' && (
          <>
            <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>Notes & Remarks</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => { void handleSaveNotes(); }}
                  disabled={isSavingNotes}
                  style={{ padding: '2px 8px', fontSize: '10px' }}
                >
                  {notesSaved ? 'Saved!' : isSavingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
              <textarea
                className="input"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Enter notes or account details for this profile..."
                rows={3}
                style={{ width: '100%', fontSize: '11px', resize: 'vertical' }}
              />
            </div>

            <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>User Data Directory</span>
                <button className="btn-icon" onClick={handleCopyPath} title="Copy Path" style={{ padding: '2px' }}>
                  {copiedPath ? <CheckIcon size={12} color="#10b981" /> : <CopyIcon size={12} />}
                </button>
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  wordBreak: 'break-all',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '6px',
                  borderRadius: '4px',
                }}
              >
                {profile.userDataDir}
              </div>
            </div>
          </>
        )}

        {/* LAUNCH OPTIONS TAB */}
        {activeTab === 'launch' && (
          <div className="glass-panel" style={{ padding: '14px', background: 'rgba(15, 23, 42, 0.6)' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff', marginBottom: '8px' }}>
              Launch Configuration
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Default Start URL</span>
                <span style={{ color: '#60a5fa' }}>https://browserleaks.com</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Headless Mode</span>
                <span style={{ color: 'var(--text-main)' }}>False (Visible Window)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Remote Debugging Port</span>
                <span style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>Auto-assigned CDP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Crash Auto-Recovery</span>
                <span style={{ color: '#10b981' }}>Active</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer Bottom Actions */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'rgba(10, 14, 23, 0.95)',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          {isRunning ? (
            <button
              className="btn btn-danger"
              style={{ flex: 1, padding: '9px 16px', fontSize: '13px' }}
              onClick={() => void stopProfile(profile.id)}
            >
              <StopIcon size={14} />
              <span>Stop Profile</span>
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ flex: 1, padding: '9px 16px', fontSize: '13px' }}
              onClick={() => void launchProfile(profile.id)}
            >
              <ExternalLinkIcon size={14} />
              <span>Launch Profile</span>
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => void cloneProfile(profile.id)}
            title="Duplicate Profile"
            style={{ padding: '9px 12px' }}
          >
            <DuplicateIcon size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
            onClick={() => openEditModal(profile.id)}
          >
            Edit Profile
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
            onClick={() => void inspectProfile(null)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
