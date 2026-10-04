import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { RefreshIcon, BoltIcon, CheckIcon } from '../../components/icons';
import { playChime, type ChimeType } from '../../utils/chimePlayer';

export function VoiceSettingsPanel() {
  const {
    voice,
    voiceCost,
    testingVoice,
    sttModels,
    ttsModels,
    loadingVoiceModels,
    voiceModelsError,
    testingVoiceConnection,
    voiceTestResult,
    updateVoiceSettings,
    loadVoiceCostSummary,
    fetchVoiceModels,
    testVoice,
    testVoiceConnection,
  } = useSettingsStore();

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [customSttMode, setCustomSttMode] = useState(false);
  const [customTtsMode, setCustomTtsMode] = useState(false);
  const [customVoiceMode, setCustomVoiceMode] = useState(false);

  useEffect(() => {
    if (sttModels.length === 0 && ttsModels.length === 0) {
      void fetchVoiceModels();
    }
  }, [fetchVoiceModels, sttModels.length, ttsModels.length]);

  useEffect(() => {
    if (voice.ttsVoice === 'en_mary_neutral') {
      void updateVoiceSettings({ ttsVoice: 'gb_jane_neutral' });
    } else if (voice.ttsVoice === 'en_alex_calm') {
      void updateVoiceSettings({ ttsVoice: 'en_paul_neutral' });
    }
  }, [voice.ttsVoice, updateVoiceSettings]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleToggleWakeWord = async (enabled: boolean) => {
    try {
      await updateVoiceSettings({ wakeWordEnabled: enabled });
      showToast(enabled ? 'Wake word detection activated.' : 'Wake word detection disabled.', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleToggleAutoSpeak = async (enabled: boolean) => {
    try {
      await updateVoiceSettings({ autoSpeak: enabled });
      showToast(enabled ? 'Agent auto-speak enabled.' : 'Agent auto-speak disabled.', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleUpdate = async (patch: Parameters<typeof updateVoiceSettings>[0]) => {
    try {
      setSaving(true);
      await updateVoiceSettings(patch);
      showToast('Voice settings updated.', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Determine available voices based on selected TTS model
  const getAvailableVoices = (): { id: string; label: string }[] => {
    const model = (voice.ttsModel || '').toLowerCase();
    if (model.includes('kokoro')) {
      return [
        { id: 'af_heart', label: 'Heart (Warm / Conversational)' },
        { id: 'af_bella', label: 'Bella (Clear / Friendly)' },
        { id: 'af_nicole', label: 'Nicole (Calm / Articulate)' },
        { id: 'af_nova', label: 'Nova (Energetic / Modern)' },
        { id: 'af_sky', label: 'Sky (Gentle / Soft)' },
        { id: 'af_alloy', label: 'Alloy (Neutral / Professional)' },
        { id: 'af_jessica', label: 'Jessica (Expressive)' },
        { id: 'af_river', label: 'River (Relaxed)' },
      ];
    }
    if (model.includes('gemini') || model.includes('lyria')) {
      return [
        { id: 'Zephyr', label: 'Zephyr (Bright / Friendly)' },
        { id: 'Puck', label: 'Puck (Playful / Dynamic)' },
        { id: 'Charon', label: 'Charon (Deep / Authoritative)' },
        { id: 'Kore', label: 'Kore (Warm / Balanced)' },
        { id: 'Fenrir', label: 'Fenrir (Rich / Resonant)' },
      ];
    }
    if (model.includes('gpt-audio') || model.includes('openai')) {
      return [
        { id: 'alloy', label: 'Alloy (Neutral / Balanced)' },
        { id: 'echo', label: 'Echo (Warm / Grounded)' },
        { id: 'fable', label: 'Fable (Expressive / British)' },
        { id: 'onyx', label: 'Onyx (Deep / Authoritative)' },
        { id: 'nova', label: 'Nova (Energetic / Bright)' },
        { id: 'shimmer', label: 'Shimmer (Clear / Crisp)' },
      ];
    }
    // Default Voxtral / standard voices (officially supported by OpenRouter / Mistral)
    return [
      { id: 'en_paul_neutral', label: 'Paul (English - Neutral / Professional)' },
      { id: 'gb_jane_neutral', label: 'Jane (British - Warm / Conversational)' },
      { id: 'en_paul_happy', label: 'Paul (English - Upbeat / Warm)' },
      { id: 'en_paul_excited', label: 'Paul (English - Enthusiastic)' },
      { id: 'gb_oliver_neutral', label: 'Oliver (British - Formal / Articulate)' },
      { id: 'fr_marie_neutral', label: 'Marie (French accent - Smooth)' },
    ];
  };

  const availableVoices = getAvailableVoices();

  return (
    <div
      className="glass-panel"
      style={{
        padding: '24px',
        background: 'rgba(15, 23, 42, 0.5)',
        position: 'relative',
        zIndex: 5,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        marginBottom: '24px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Wake Word & Voice System
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              100% hands-free voice automation with client-side openWakeWord and OpenRouter neural voice models.
            </span>
          </div>
        </div>

        {toast && (
          <span
            style={{
              fontSize: '11px',
              padding: '5px 12px',
              borderRadius: '6px',
              background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)',
              color: toast.type === 'error' ? '#fca5a5' : '#a5b4fc',
              border: `1px solid ${toast.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {toast.message}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Row 1: Toggles */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            padding: '12px 16px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Wake Word Enable */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={voice.wakeWordEnabled}
              onChange={(e) => void handleToggleWakeWord(e.target.checked)}
              style={{ accentColor: '#6366f1', width: '16px', height: '16px' }}
            />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>Enable Wake Word Detection</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Listen for "{voice.wakeWordModel || 'hey_tersoo'}" client-side</div>
            </div>
          </label>

          {/* Auto-Speak Enable */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={voice.autoSpeak}
              onChange={(e) => void handleToggleAutoSpeak(e.target.checked)}
              style={{ accentColor: '#6366f1', width: '16px', height: '16px' }}
            />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>Auto-Speak Agent Replies</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Automatically play assistant replies aloud using TTS</div>
            </div>
          </label>
        </div>

        {/* Row 2: Wake Word Model & Detection Threshold */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              WAKE WORD MODEL (ACTIVATION NAME)
            </label>
            <select
              value={voice.wakeWordModel}
              onChange={(e) => void handleUpdate({ wakeWordModel: e.target.value })}
              className="input"
              style={{ width: '100%', height: '36px' }}
            >
              <option value="hey_tersoo">"Hey Tersoo" (Default Custom Core)</option>
              <option value="hey_jarvis">"Hey Jarvis" (AI Assistant Voice)</option>
              <option value="alexa">"Alexa" (Smart Home Style)</option>
              <option value="hey_mycroft">"Hey Mycroft" (Open Source Assistant)</option>
              <option value="hey_rhasspy">"Hey Rhasspy" (Privacy Voice)</option>
            </select>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Embedded ONNX runtime model runs fully client-side in your desktop environment.
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                DETECTION SENSITIVITY THRESHOLD
              </label>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc' }}>
                {voice.wakeWordThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={voice.wakeWordThreshold}
              onChange={(e) => void handleUpdate({ wakeWordThreshold: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#6366f1', height: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              <span>0.30 (Sensitive)</span>
              <span>0.50 (Balanced)</span>
              <span>0.90 (Strict)</span>
            </div>
          </div>
        </div>

        {/* Row 3: Audible Chime & Earcon Feedback */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              ACTIVATION CHIME / EARCON SOUND
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={(voice as any).chimeSound || 'pleasant'}
                onChange={(e) => void handleUpdate({ chimeSound: e.target.value } as any)}
                className="input"
                style={{ flex: 1, height: '36px' }}
              >
                <option value="pleasant">Melodic Harmony (Gentle 3-Tone)</option>
                <option value="cyber">Cyber Sweep (Futuristic Sci-Fi)</option>
                <option value="ping">Soft Bell Ping (Minimalist)</option>
                <option value="listen">Ready Tone (Clean Tone)</option>
                <option value="none">Mute (Silent Activation)</option>
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  playChime(((voice as any).chimeSound || 'pleasant') as ChimeType);
                  showToast('✓ Chime earcon played.', 'info');
                }}
                style={{ padding: '0 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                title="Preview this activation earcon sound"
              >
                Test Chime
              </button>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Plays through speakers as soon as your wake phrase is recognized.
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              ASSISTANT GREETING PHRASE (SPOKEN)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={voice.greetingText}
                onChange={(e) => void handleUpdate({ greetingText: e.target.value })}
                className="input"
                style={{ flex: 1 }}
                placeholder="Yes, how can I help?"
              />
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await testVoice(voice.greetingText);
                    showToast('✓ Greeting phrase played successfully.', 'success');
                  } catch (e: any) {
                    showToast(`✕ Voice playback failed: ${e.message}`, 'error');
                  }
                }}
                disabled={testingVoice}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', padding: '0 14px' }}
                title="Test assistant greeting phrase audio playback"
              >
                {testingVoice ? <RefreshIcon size={14} className="pulse" /> : null}
                <span>{testingVoice ? 'Speaking...' : 'Test Voice'}</span>
              </button>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Neural TTS phrase spoken immediately upon wake word trigger before recording.
            </span>
          </div>
        </div>

        {/* Row 4: Silence Detection & Speaking Duration Constraints */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                SILENCE TIMEOUT BEFORE AUTO-SEND
              </label>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                {(voice.commandSilenceStopMs / 1000).toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={15000}
              step={500}
              value={voice.commandSilenceStopMs}
              onChange={(e) => void handleUpdate({ commandSilenceStopMs: parseInt(e.target.value, 10) })}
              style={{ width: '100%', accentColor: '#38bdf8', height: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              <span>1.0s (Fast)</span>
              <span>5.0s (Default / Conversational)</span>
              <span>15.0s (Deliberate)</span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              When you stop speaking for this long, recording finishes and auto-sends to the model.
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                MAX TALKING DURATION
              </label>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                {voice.commandMaxDurationMs >= 60000
                  ? `${(voice.commandMaxDurationMs / 60000).toFixed(1)} min`
                  : `${(voice.commandMaxDurationMs / 1000).toFixed(0)}s`}
              </span>
            </div>
            <input
              type="range"
              min={15000}
              max={600000}
              step={15000}
              value={voice.commandMaxDurationMs}
              onChange={(e) => void handleUpdate({ commandMaxDurationMs: parseInt(e.target.value, 10) })}
              style={{ width: '100%', accentColor: '#38bdf8', height: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              <span>15s</span>
              <span>5 min (Default)</span>
              <span>10 min (Unrestricted)</span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
              Safety ceiling allowing unrestricted speaking without being abruptly cut off.
            </span>
          </div>
        </div>

        {/* Row 5: Dynamic OpenRouter Models Section */}
        <div
          style={{
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.22)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                OpenRouter Neural Voice Models (Live Discovery)
              </span>
              <span
                style={{
                  fontSize: '10px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
              >
                {sttModels.length} STT • {ttsModels.length} TTS Available
              </span>
            </div>

            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  await fetchVoiceModels(true);
                  showToast('✓ Voice models refreshed from OpenRouter.', 'success');
                } catch (e: any) {
                  showToast(`✕ Refresh failed: ${e.message}`, 'error');
                }
              }}
              disabled={loadingVoiceModels}
              style={{ fontSize: '11px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="Query OpenRouter for latest audio and voice models"
            >
              <RefreshIcon size={12} className={loadingVoiceModels ? 'pulse' : ''} />
              <span>{loadingVoiceModels ? 'Fetching Models...' : 'Fetch Live Models'}</span>
            </button>
          </div>

          {voiceModelsError && (
            <div style={{ fontSize: '11px', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>
              ⚠️ Model discovery note: {voiceModelsError} (Using standard offline models).
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* STT Model Dropdown */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  STT MODEL (SPEECH-TO-TEXT)
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 600, background: 'rgba(52, 211, 153, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                    [STT] Audio Input
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomSttMode(!customSttMode)}
                    style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                  >
                    {customSttMode ? 'List' : 'Custom'}
                  </button>
                </div>
              </div>

              {customSttMode ? (
                <input
                  type="text"
                  value={voice.sttModel}
                  onChange={(e) => void handleUpdate({ sttModel: e.target.value })}
                  className="input"
                  style={{ width: '100%', height: '36px' }}
                  placeholder="e.g. openai/whisper-large-v3"
                />
              ) : (
                <select
                  value={voice.sttModel}
                  onChange={(e) => void handleUpdate({ sttModel: e.target.value })}
                  className="input"
                  style={{ width: '100%', height: '36px' }}
                  disabled={loadingVoiceModels}
                >
                  {sttModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name.startsWith('[STT]') ? m.name : `[STT] ${m.name}`} ({m.id})
                    </option>
                  ))}
                  {/* Fallback if current custom model isn't in list */}
                  {voice.sttModel && !sttModels.some((m) => m.id === voice.sttModel) && (
                    <option value={voice.sttModel}>[STT] {voice.sttModel} (Custom)</option>
                  )}
                </select>
              )}
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                Converts microphone audio into transcribed user prompt text.
              </span>
            </div>

            {/* TTS Model Dropdown */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  TTS MODEL (TEXT-TO-SPEECH)
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: 600, background: 'rgba(168, 85, 247, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                    [TTS] Voice Output
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomTtsMode(!customTtsMode)}
                    style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                  >
                    {customTtsMode ? 'List' : 'Custom'}
                  </button>
                </div>
              </div>

              {customTtsMode ? (
                <input
                  type="text"
                  value={voice.ttsModel}
                  onChange={(e) => void handleUpdate({ ttsModel: e.target.value })}
                  className="input"
                  style={{ width: '100%', height: '36px' }}
                  placeholder="e.g. mistralai/voxtral-mini-tts-2603"
                />
              ) : (
                <select
                  value={voice.ttsModel}
                  onChange={(e) => void handleUpdate({ ttsModel: e.target.value })}
                  className="input"
                  style={{ width: '100%', height: '36px' }}
                  disabled={loadingVoiceModels}
                >
                  {ttsModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name.startsWith('[TTS]') ? m.name : `[TTS] ${m.name}`} ({m.id})
                    </option>
                  ))}
                  {/* Fallback if current custom model isn't in list */}
                  {voice.ttsModel && !ttsModels.some((m) => m.id === voice.ttsModel) && (
                    <option value={voice.ttsModel}>[TTS] {voice.ttsModel} (Custom)</option>
                  )}
                </select>
              )}
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                Generates spoken audio waveforms from agent response text.
              </span>
            </div>
          </div>
        </div>

        {/* Row 6: TTS Voice Personality */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              TTS VOICE PERSONALITY
            </label>
            <button
              type="button"
              onClick={() => setCustomVoiceMode(!customVoiceMode)}
              style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '10px', cursor: 'pointer', padding: 0 }}
            >
              {customVoiceMode ? 'Preset Voices' : 'Custom Voice'}
            </button>
          </div>

          {customVoiceMode ? (
            <input
              type="text"
              value={voice.ttsVoice}
              onChange={(e) => void handleUpdate({ ttsVoice: e.target.value })}
              className="input"
              style={{ width: '100%', height: '36px' }}
              placeholder="e.g. en_paul_neutral or alloy"
            />
          ) : (
            <select
              value={voice.ttsVoice}
              onChange={(e) => void handleUpdate({ ttsVoice: e.target.value })}
              className="input"
              style={{ width: '100%', height: '36px' }}
            >
              {availableVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
              {/* If user has a custom voice selected not in the preset list */}
              {voice.ttsVoice && !availableVoices.some((v) => v.id === voice.ttsVoice) && (
                <option value={voice.ttsVoice}>Custom: {voice.ttsVoice}</option>
              )}
            </select>
          )}
        </div>

        {/* Row 7: Live Voice Connection Test Card */}
        <div
          style={{
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.28)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                  Live Voice Connection & Model Test
                </span>
                <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', padding: '1px 6px', borderRadius: '4px' }}>
                  OpenRouter
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                Verifies communication with OpenRouter API, checks STT readiness, and verifies TTS voice synthesis.
              </div>
            </div>

            <button
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const res = await testVoiceConnection({
                    sttModel: voice.sttModel,
                    ttsModel: voice.ttsModel,
                    ttsVoice: voice.ttsVoice,
                    greetingText: voice.greetingText,
                  });
                  if (res.success) {
                    showToast('✓ Voice models connected & verified!', 'success');
                  } else {
                    showToast(`✕ Voice test error: ${res.message}`, 'error');
                  }
                } catch (e: any) {
                  showToast(`✕ Error: ${e.message}`, 'error');
                }
              }}
              disabled={testingVoiceConnection}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {testingVoiceConnection ? <RefreshIcon size={14} className="pulse" /> : <BoltIcon size={14} />}
              <span>{testingVoiceConnection ? 'Testing Voice...' : 'Test Connection'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <div>
              Active STT: <strong style={{ color: '#34d399' }}>{voice.sttModel}</strong>
            </div>
            <div>•</div>
            <div>
              Active TTS: <strong style={{ color: '#a855f7' }}>{voice.ttsModel}</strong> ({voice.ttsVoice})
            </div>
          </div>

          {voiceTestResult && (
            <div
              style={{
                marginTop: '12px',
                padding: '12px 14px',
                borderRadius: '6px',
                background: voiceTestResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                border: `1px solid ${voiceTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                color: voiceTestResult.success ? '#34d399' : '#f43f5e',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {voiceTestResult.success ? '✓ Voice Connection Verified' : '✕ Voice Connection Failed'}
                </strong>
                {voiceTestResult.latencyMs > 0 && (
                  <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: '4px', color: '#ffffff' }}>
                    Latency: {voiceTestResult.latencyMs}ms
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: voiceTestResult.success ? 'var(--text-main)' : '#fb7185', lineHeight: '1.4' }}>
                {voiceTestResult.message}
              </div>
              {voiceTestResult.details && (
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '10px' }}>
                  <span style={{ color: voiceTestResult.details.sttVerified ? '#34d399' : '#f43f5e' }}>
                    • {voiceTestResult.details.sttMessage || (voiceTestResult.details.sttVerified ? 'STT Model Verified' : 'STT Model Error')}
                  </span>
                  <span style={{ color: voiceTestResult.details.ttsVerified ? '#34d399' : '#f43f5e' }}>
                    • {voiceTestResult.details.ttsMessage || (voiceTestResult.details.ttsVerified ? 'TTS Model Verified' : 'TTS Model Error')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 8: Cost Summary (Last 30 Days) */}
        <div
          style={{
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Voice Usage & Cost Summary (Last 30 Days)
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => void loadVoiceCostSummary()}
              style={{ fontSize: '11px', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshIcon size={12} />
              Refresh
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px' }}>STT SPEND (USD)</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>
                ${(voiceCost?.sttCostUsd ?? 0).toFixed(4)}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px' }}>VOICE COMMANDS</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                {voiceCost?.sttRequests ?? 0}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px' }}>SPOKEN RESPONSES</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                {voiceCost?.ttsRequests ?? 0}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px' }}>AUDIO DURATION</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#a5b4fc' }}>
                {(((voiceCost?.totalAudioMs ?? 0) / 1000) / 60).toFixed(1)}m
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
