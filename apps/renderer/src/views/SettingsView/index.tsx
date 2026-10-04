import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  BoltIcon,
  CheckIcon,
  CpuIcon,
  EyeIcon,
  LockIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from '../../components/icons';
import { SearchableModelSelect } from '../../components/common/SearchableModelSelect';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';

export function SettingsView() {
  const {
    engineWeights,
    loadingWeights,
    llmConfig,
    loadingLlm,
    testingLlm,
    testLlmResult,
    openrouterKeyStatus,
    geminiKeyStatus,
    modelsList,
    loadingModels,
    modelsError,
    captchaBudget,
    ramCheck,
    launchInterval,
    loadingLaunchInterval,
    error,
    loadAllSettings,
    updateWeights,
    updateLaunchInterval,
    updateLlmConfig,
    saveApiKey,
    fetchModels,
    updateCaptchaBudget,
    updateRamCheck,
    testLlmConnection,
  } = useSettingsStore();

  const [weights, setWeights] = useState(engineWeights);
  const [llmForm, setLlmForm] = useState(llmConfig);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [budget, setBudget] = useState(captchaBudget);
  const [intervalForm, setIntervalForm] = useState({
    minSec: launchInterval.minSec,
    maxSec: launchInterval.maxSec,
    concurrency: launchInterval.concurrency,
  });
  const [testPrompt, setTestPrompt] = useState('Ping connection test');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    void loadAllSettings();
  }, [loadAllSettings]);

  useEffect(() => {
    setWeights(engineWeights);
  }, [engineWeights]);

  useEffect(() => {
    setIntervalForm({
      minSec: launchInterval.minSec,
      maxSec: launchInterval.maxSec,
      concurrency: launchInterval.concurrency,
    });
  }, [launchInterval]);

  useEffect(() => {
    setLlmForm(llmConfig);
  }, [llmConfig]);

  useEffect(() => {
    setBudget(captchaBudget);
  }, [captchaBudget]);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleSaveWeights = async () => {
    try {
      await updateWeights(weights);
      showToast('Engine distribution weights saved.');
    } catch {
      // error handled in store
    }
  };

  const handleSaveLaunchInterval = async () => {
    if (intervalForm.minSec > intervalForm.maxSec) {
      showToast('Error: Minimum interval cannot exceed maximum interval.');
      return;
    }
    if (intervalForm.minSec < 0 || intervalForm.maxSec < 1) {
      showToast('Error: Interval values must be positive.');
      return;
    }
    try {
      await updateLaunchInterval(intervalForm);
      showToast('Profile launch interval and concurrency settings saved.');
    } catch {
      // error handled in store
    }
  };

  const handleSaveLlm = async () => {
    try {
      await updateLlmConfig(llmForm);
      showToast('LLM configuration saved.');
    } catch {
      // error handled in store
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      showToast('Please paste a valid API key first.');
      return;
    }
    setSavingKey(true);
    try {
      const provider = (llmForm.provider as 'openrouter' | 'gemini') || 'openrouter';
      await saveApiKey(provider, apiKeyInput.trim());
      showToast(`${provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini'} key encrypted and saved to vault!`);
      setApiKeyInput('');
    } catch (err: unknown) {
      showToast(`Error saving API key: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingKey(false);
    }
  };

  const handleProviderSwitch = (newProvider: 'openrouter' | 'gemini') => {
    setLlmForm({ ...llmForm, provider: newProvider });
    setApiKeyInput('');
    void fetchModels(newProvider);
  };

  const handleSaveCaptcha = async () => {
    try {
      await updateCaptchaBudget(budget);
      showToast('CAPTCHA budget saved.');
    } catch {
      // error handled in store
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: 0 }}>System Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
          Configure Dual-Engine distribution weights, LLM inference endpoints, and automated CAPTCHA budgets.
        </p>
      </div>

      {saveToast && (
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
          <span>{saveToast}</span>
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

      {/* 1. DUAL-ENGINE DISTRIBUTION */}
      <div className="glass-panel" style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <BoltIcon size={18} color="#60a5fa" />
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Dual-Engine Distribution Weights
          </h2>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
          Default allocation for bulk profile creation and automated persona rotation. Apostate (Chromium) defaults to 70% for standard web traffic, Camoufox (Gecko) defaults to 30% for high-anti-bot targets.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa' }}>
              Apostate (Chromium): {weights.apostate}%
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fb923c' }}>
              Camoufox (Firefox): {weights.camoufox}%
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={weights.apostate}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setWeights({ apostate: val, camoufox: 100 - val });
            }}
            style={{ width: '100%', accentColor: '#3b82f6', height: '6px' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Target Split: {weights.apostate} / {weights.camoufox}
            </span>
            <button
              className="btn btn-primary"
              onClick={() => void handleSaveWeights()}
              disabled={loadingWeights}
              style={{ padding: '6px 16px', fontSize: '12px' }}
            >
              Save Weights
            </button>
          </div>
        </div>
      </div>

      {/* 2. PROFILE LAUNCH STAGGER & CONCURRENCY */}
      <div className="glass-panel" style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <RefreshIcon size={18} color="#34d399" />
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Profile Launch Stagger & Concurrency
          </h2>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
          Randomize the interval between launching multiple profiles to simulate natural human behavior and avoid network burst throttling.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              MIN INTERVAL (SECONDS)
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={3600}
              value={intervalForm.minSec}
              onChange={(e) => setIntervalForm({ ...intervalForm, minSec: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Minimum wait before next profile launches
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              MAX INTERVAL (SECONDS)
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={3600}
              value={intervalForm.maxSec}
              onChange={(e) => setIntervalForm({ ...intervalForm, maxSec: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Maximum wait before next profile launches
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              DEFAULT CONCURRENCY
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={intervalForm.concurrency}
              onChange={(e) => setIntervalForm({ ...intervalForm, concurrency: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Max simultaneous browser windows
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Each profile launch will delay between <strong style={{ color: '#34d399' }}>{intervalForm.minSec}s</strong> and <strong style={{ color: '#34d399' }}>{intervalForm.maxSec}s</strong> with up to <strong style={{ color: '#ffffff' }}>{intervalForm.concurrency}</strong> active windows.
          </span>
          <button
            className="btn btn-primary"
            onClick={() => void handleSaveLaunchInterval()}
            disabled={loadingLaunchInterval}
            style={{ padding: '6px 16px', fontSize: '12px' }}
          >
            Save Launch Settings
          </button>
        </div>
      </div>

      {/* 3. LLM CONFIGURATION */}
      <div className="glass-panel" style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.5)', position: 'relative', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CpuIcon size={20} color="#a78bfa" />
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              LLM Intelligence & Vision Solver
            </h2>
          </div>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(167, 139, 250, 0.1)',
              color: '#c084fc',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              fontWeight: 600,
            }}
          >
            ACTIVE: {llmForm.provider === 'gemini' ? 'GOOGLE GEMINI' : 'OPENROUTER'}
          </span>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px', lineHeight: '1.5' }}>
          Connect autonomous reasoning, accessibility tree goal solvers, and screenshot visual CAPTCHA solvers. API keys are locally encrypted using AES-256 in your machine&apos;s secure vault.
        </p>

        {/* Provider Switcher Tabs */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            SELECT ACTIVE LLM GATEWAY
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* OpenRouter Tab */}
            <div
              onClick={() => handleProviderSwitch('openrouter')}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: llmForm.provider === 'openrouter' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                border: llmForm.provider === 'openrouter' ? '1.5px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff' }}>OpenRouter</span>
                {openrouterKeyStatus.hasKey ? (
                  <span style={{ fontSize: '10px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LockIcon size={10} color="#34d399" /> Key Encrypted
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', color: '#f59e0b' }}>Key Missing</span>
                )}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Multi-model gateway for DeepSeek, Claude 3.5, Llama 3, GPT-4o, and Qwen.
              </span>
            </div>

            {/* Google Gemini Tab */}
            <div
              onClick={() => handleProviderSwitch('gemini')}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: llmForm.provider === 'gemini' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                border: llmForm.provider === 'gemini' ? '1.5px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff' }}>Google Gemini</span>
                {geminiKeyStatus.hasKey ? (
                  <span style={{ fontSize: '10px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LockIcon size={10} color="#34d399" /> Key Encrypted
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', color: '#f59e0b' }}>Key Missing</span>
                )}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Direct API for Gemini 1.5 Flash, 1.5 Pro, and 2.0 Flash with native vision.
              </span>
            </div>
          </div>
        </div>

        {/* API Key Vault Slot */}
        <div style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              {llmForm.provider === 'gemini' ? 'GOOGLE GEMINI API KEY' : 'OPENROUTER API KEY'} (AES-256 VAULT)
            </label>
            {(llmForm.provider === 'gemini' ? geminiKeyStatus.hasKey : openrouterKeyStatus.hasKey) ? (
              <span style={{ fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckIcon size={12} color="#34d399" />
                <span>
                  Vault active:{' '}
                  <strong>{llmForm.provider === 'gemini' ? geminiKeyStatus.maskedKey : openrouterKeyStatus.maskedKey}</strong>
                </span>
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>⚠️ No API key saved in vault</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                className="input"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  (llmForm.provider === 'gemini' ? geminiKeyStatus.hasKey : openrouterKeyStatus.hasKey)
                    ? 'Paste new key to replace stored key...'
                    : llmForm.provider === 'gemini'
                      ? 'Paste your Gemini API key (AIzaSy...)'
                      : 'Paste your OpenRouter key (sk-or-v1-...)'
                }
                style={{ width: '100%', paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide key' : 'Show key'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                <EyeIcon size={14} />
              </button>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => void handleSaveApiKey()}
              disabled={savingKey || !apiKeyInput.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <LockIcon size={13} />
              <span>{savingKey ? 'Encrypting...' : 'Save & Encrypt'}</span>
            </button>
          </div>
        </div>

        {/* Dynamic Model Pickers Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>Model Configuration</span>
            {modelsList.length > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  fontWeight: 600,
                }}
              >
                {modelsList.length} Live Models Loaded
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void fetchModels(llmForm.provider as any)}
            disabled={loadingModels}
            style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshIcon size={12} className={loadingModels ? 'pulse' : undefined} />
            <span>{loadingModels ? 'Fetching Models...' : 'Refresh Model Catalog'}</span>
          </button>
        </div>

        {modelsError && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#fb7185',
              fontSize: '11px',
              marginBottom: '14px',
            }}
          >
            <strong>Failed to fetch model catalog:</strong> {modelsError}
          </div>
        )}

        {/* Searchable Model Pickers Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', position: 'relative', zIndex: 40 }}>
          <div style={{ position: 'relative' }}>
            <SearchableModelSelect
              label="TEXT REASONING MODEL (SEARCHABLE)"
              models={modelsList}
              value={llmForm.text_model}
              onChange={(m) => setLlmForm({ ...llmForm, text_model: m })}
              loading={loadingModels}
              placeholder="Search or select text reasoning model..."
            />
          </div>

          <div style={{ position: 'relative' }}>
            <SearchableModelSelect
              label="VISION / CAPTCHA MODEL (SEARCHABLE)"
              models={modelsList}
              value={llmForm.vision_model ?? ''}
              filterVisionOnly={true}
              onChange={(m) => setLlmForm({ ...llmForm, vision_model: m || null })}
              loading={loadingModels}
              placeholder="Search or select vision/CAPTCHA model..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}>
            <input
              type="checkbox"
              checked={llmForm.vision_enabled}
              onChange={(e) => setLlmForm({ ...llmForm, vision_enabled: e.target.checked })}
              style={{ accentColor: '#a78bfa' }}
            />
            <span>Enable Vision Fallback for CAPTCHAs & Visual Steps</span>
          </label>

          <button
            className="btn btn-primary"
            onClick={() => void handleSaveLlm()}
            disabled={loadingLlm}
            style={{ padding: '6px 16px', fontSize: '12px' }}
          >
            Save LLM Config
          </button>
        </div>

        {/* Live Test Connection Card */}
        <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '12px', color: '#ffffff' }}>
              Live LLM Connection Test
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Testing: <strong>{llmForm.provider}</strong> • <span style={{ color: 'var(--color-primary)' }}>{llmForm.text_model}</span>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="input"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              style={{ flex: 1 }}
              placeholder="Test prompt..."
            />
            <button
              className="btn btn-secondary"
              onClick={() => void testLlmConnection(testPrompt, { provider: llmForm.provider as any, model: llmForm.text_model })}
              disabled={testingLlm}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              {testingLlm ? <RefreshIcon size={14} className="pulse" /> : <BoltIcon size={14} />}
              <span>{testingLlm ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>

          {testLlmResult && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: testLlmResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                border: `1px solid ${testLlmResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                color: testLlmResult.success ? '#34d399' : '#f43f5e',
                fontSize: '12px',
                wordBreak: 'break-word',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong>{testLlmResult.success ? '✓ Connection Verified:' : '✕ Error:'}</strong>
                {testLlmResult.latencyMs && (
                  <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                    Latency: {testLlmResult.latencyMs}ms
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: testLlmResult.success ? 'var(--text-main)' : '#fb7185', lineHeight: '1.4' }}>
                {testLlmResult.message}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VOICE & WAKE WORD SETTINGS */}
      <VoiceSettingsPanel />

      {/* 3. CAPTCHA HANDLING SETTINGS */}
      <div className="glass-panel" style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.5)', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <ShieldCheckIcon size={18} color="#34d399" />
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            CAPTCHA Handling & Budget Policy
          </h2>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
          Configure maximum challenge tolerances before runs are aborted to avoid bot-flag escalation.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              MAX CAPTCHA BUDGET PER PROFILE
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={budget}
              onChange={(e) => setBudget(Math.max(1, parseInt(e.target.value) || 1))}
              className="input"
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
              Exceeding this budget triggers <code>CAPTCHA_BUDGET_EXCEEDED</code> and aborts run.
            </span>
          </div>

          <div style={{ textAlign: 'right', alignSelf: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={() => void handleSaveCaptcha()}
              style={{ padding: '6px 16px', fontSize: '12px' }}
            >
              Save Budget
            </button>
          </div>
        </div>
      </div>

      {/* 4. RESOURCE MANAGEMENT */}
      <div className="glass-panel" style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.5)', position: 'relative', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <CpuIcon size={18} color="#f59e0b" />
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Resource Management
          </h2>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
          Controls system RAM pressure checks that gate browser launches. Disable the check on memory-constrained machines where Electron + dev tooling naturally pushes RAM above the threshold.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}>
              <input
                type="checkbox"
                checked={ramCheck.skipRamCheck}
                onChange={(e) => void updateRamCheck({ skipRamCheck: e.target.checked }).then(() => showToast(e.target.checked ? 'RAM check disabled — launches will always proceed.' : 'RAM check re-enabled.'))}
                style={{ accentColor: '#f59e0b' }}
              />
              <span>Disable RAM Pressure Check (Force Allow Launches)</span>
            </label>
            <span
              style={{
                padding: '2px 10px',
                borderRadius: '9999px',
                fontSize: '10px',
                fontWeight: 700,
                background: ramCheck.skipRamCheck ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: ramCheck.skipRamCheck ? '#fbbf24' : '#34d399',
                border: `1px solid ${ramCheck.skipRamCheck ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              }}
            >
              {ramCheck.skipRamCheck ? 'BYPASSED' : 'ACTIVE'}
            </span>
          </div>

          {!ramCheck.skipRamCheck && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  MEMORY PRESSURE THRESHOLD
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>
                  {Math.round(ramCheck.memoryPressureThresholdPct * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                value={Math.round(ramCheck.memoryPressureThresholdPct * 100)}
                onChange={(e) => {
                  const pct = parseInt(e.target.value, 10) / 100;
                  void updateRamCheck({ memoryPressureThresholdPct: pct });
                }}
                style={{ width: '100%', accentColor: '#f59e0b', height: '6px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>50% (Aggressive)</span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>99% (Permissive)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsView;
