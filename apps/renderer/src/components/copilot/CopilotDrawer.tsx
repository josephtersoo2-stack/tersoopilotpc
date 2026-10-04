import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
import type { CopilotAttachment } from '@tersoo/contracts';
import { useCopilotStore } from '../../stores/copilotStore';
import { useProfilesStore } from '../../stores/profilesStore';
import { useTasksStore } from '../../stores/tasksStore';
import { useNichesStore } from '../../stores/nichesStore';
import {
  FileTextIcon,
  ImageIcon,
  PaperclipIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
  MicrophoneIcon,
  CopyIcon,
  CheckIcon,
  ClockIcon,
  PencilIcon,
} from '../icons';
import { CopilotActionCard } from './CopilotActionCard';
import { useSettingsStore } from '../../stores/settingsStore';
import { startCommandRecording, type ActiveRecording } from '../../utils/commandRecorder';
import { invokeIpc } from '../../lib/ipc';
import { playChime, type ChimeType } from '../../utils/chimePlayer';
import { playBase64Audio } from '../../utils/audioPlayer';

interface CopilotDrawerProps {
  currentView: string;
  onSelectView?: (view: string) => void;
}

export function CopilotDrawer({ currentView, onSelectView }: CopilotDrawerProps) {
  const {
    isOpen,
    setOpen,
    messages,
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    sendMessage,
    editMessage,
    resendMessageFrom,
    loading,
    clearHistory,
  } = useCopilotStore();

  const [inputVal, setInputVal] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording & transcription state
  const { voice } = useSettingsStore();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0);
  const [silenceRemainingSec, setSilenceRemainingSec] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [isSpeakingReply, setIsSpeakingReply] = useState(false);
  const [handsFreeLoop, setHandsFreeLoop] = useState(true);
  const handsFreeLoopRef = useRef(true);
  handsFreeLoopRef.current = handsFreeLoop;
  const [voiceFeedback, setVoiceFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<any>(null);

  // Read context from renderer stores
  const selectedIdsSet = useProfilesStore((s) => s.selectedIds);
  const selectedProfiles = selectedIdsSet ? Array.from(selectedIdsSet) : [];
  const profilesCount = useProfilesStore((s) => s.profiles.length);
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const tasksCount = useTasksStore((s) => s.tasks.length);
  const nichesCount = useNichesStore((s) => s.niches.length);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Build real-time context payload
  const buildContextPayload = () => {
    return {
      activeView: currentView,
      selectedProfileIds: selectedProfiles && selectedProfiles.length > 0 ? selectedProfiles : undefined,
      activeTaskId: selectedTaskId ?? undefined,
      summary: `View: ${currentView} | Total Profiles: ${profilesCount} | Total Tasks: ${tasksCount} | Niches: ${nichesCount}`,
    };
  };

  const handleSend = async () => {
    if (!inputVal.trim() && attachments.length === 0) return;
    const text = inputVal;
    setInputVal('');
    await sendMessage(text, buildContextPayload());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageDateTime = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) {
      return `Today, ${timeStr}`;
    }
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }
    const dateStr = date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    });
    return `${dateStr}, ${timeStr}`;
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleStartEdit = (msgId: string, currentText: string) => {
    setEditingMessageId(msgId);
    setEditContent(currentText);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSaveEdit = (msgId: string) => {
    if (!editContent.trim()) return;
    editMessage(msgId, editContent.trim());
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSaveAndResend = async (msgId: string) => {
    if (!editContent.trim() || loading) return;
    const text = editContent.trim();
    setEditingMessageId(null);
    setEditContent('');
    await resendMessageFrom(msgId, text, buildContextPayload());
  };

  // Process recorded audio, transcribe with Whisper, auto-send to Copilot, and auto-speak reply
  const processRecordingAndAutoSend = async (blob: Blob) => {
    setIsRecording(false);
    setAudioVolume(0);
    setSilenceRemainingSec(null);
    setTranscribing(true);
    setVoiceFeedback({ message: 'Transcribing speech with Whisper...', type: 'info' });

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const sttModel = voice.sttModel || 'openai/whisper-large-v3';

      const transcriptRes = await invokeIpc('voice.transcribe', {
        audio: new Uint8Array(arrayBuffer),
        format: 'webm',
        language: voice.sttLanguage,
        model: sttModel,
      });

      const text = transcriptRes?.text?.trim();
      if (text) {
        // Confirmation earcon & clear input field
        playChime('send');
        setInputVal('');
        setVoiceFeedback({
          message: `✓ Transcribed: "${text.length > 55 ? text.slice(0, 55) + '...' : text}"`,
          type: 'success',
        });

        // 1. Auto-send directly to Copilot
        await sendMessage(text, buildContextPayload());

        // 2. Auto-speak assistant response if enabled
        if (voice.autoSpeak) {
          const currentMsgs = useCopilotStore.getState().messages;
          const lastMsg = currentMsgs[currentMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
            setIsSpeakingReply(true);
            setVoiceFeedback({ message: 'Tersoo speaking reply...', type: 'info' });
            try {
              const speakRes = await invokeIpc('voice.speak', {
                text: lastMsg.content.slice(0, 4000),
                voice: voice.ttsVoice || 'en_paul_neutral',
                model: voice.ttsModel || 'mistralai/voxtral-mini-tts-2603',
                responseFormat: 'mp3',
              });

              if (speakRes?.audio) {
                await playBase64Audio(speakRes.audio, speakRes.format || 'mp3');
              }
            } catch (speakErr: any) {
              console.warn('[CopilotDrawer] Voice playback failed:', speakErr);
            } finally {
              setIsSpeakingReply(false);
              setVoiceFeedback(null);
            }
          }
        }

        // 3. Hands-free loop: If Auto-Pilot is enabled and drawer is still open, re-arm for next turn
        if (handsFreeLoopRef.current && useCopilotStore.getState().isOpen) {
          setTimeout(() => {
            if (handsFreeLoopRef.current && useCopilotStore.getState().isOpen && !activeRecordingRef.current) {
              playChime('listen');
              void toggleVoiceRecording();
            }
          }, 1200);
        }
      } else {
        setVoiceFeedback({ message: 'No speech recognized. Speak clearly to try again.', type: 'info' });
        setTimeout(() => setVoiceFeedback(null), 3500);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg !== 'RECORDING_TOO_SHORT' && msg !== 'RECORDING_CANCELLED') {
        setVoiceFeedback({ message: `Transcription error: ${msg}`, type: 'error' });
      }
    } finally {
      setTranscribing(false);
      setAudioVolume(0);
      setSilenceRemainingSec(null);
      activeRecordingRef.current = null;
    }
  };

  // Stop active recording and trigger processing
  const stopVoiceRecording = async () => {
    if (!activeRecordingRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const current = activeRecordingRef.current;
    activeRecordingRef.current = null;
    try {
      const blob = await current.stop();
      await processRecordingAndAutoSend(blob);
    } catch (err: any) {
      setIsRecording(false);
      setTranscribing(false);
      setAudioVolume(0);
      setSilenceRemainingSec(null);
      const msg = err?.message || String(err);
      if (msg !== 'RECORDING_TOO_SHORT' && msg !== 'RECORDING_CANCELLED') {
        setVoiceFeedback({ message: `Microphone error: ${msg}`, type: 'error' });
      }
    }
  };

  const cancelVoiceRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    activeRecordingRef.current?.cancel();
    activeRecordingRef.current = null;
    setIsRecording(false);
    setTranscribing(false);
    setAudioVolume(0);
    setSilenceRemainingSec(null);
    setVoiceFeedback(null);
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      await stopVoiceRecording();
      return;
    }

    setVoiceFeedback(null);
    setRecordingDuration(0);
    setAudioVolume(0);
    setSilenceRemainingSec(null);

    // Play activation chime
    playChime(((voice as any).chimeSound || 'pleasant') as ChimeType);

    try {
      const maxDuration = voice.commandMaxDurationMs || 300000;
      const silenceStop = voice.commandSilenceStopMs || 5000;

      const recording = startCommandRecording({
        maxDurationMs: maxDuration,
        silenceStopMs: silenceStop,
        initialSilenceTimeoutMs: 12000,
        minDurationMs: 400,
        onVolumeChange: (vol) => {
          setAudioVolume(vol);
        },
        onSilenceCountdown: (remainingSec) => {
          setSilenceRemainingSec(remainingSec);
        },
        onSpeechDetected: () => {
          setSilenceRemainingSec(null);
        },
      });

      activeRecordingRef.current = recording;
      setIsRecording(true);

      const start = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - start) / 1000));
      }, 500);

      // Handle auto-finish on silence
      recording.promise
        .then(async (blob) => {
          if (activeRecordingRef.current === recording) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            await processRecordingAndAutoSend(blob);
          }
        })
        .catch((err) => {
          if (activeRecordingRef.current === recording) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setIsRecording(false);
            setTranscribing(false);
            setAudioVolume(0);
            setSilenceRemainingSec(null);
            activeRecordingRef.current = null;
            const msg = err?.message || String(err);
            if (msg !== 'RECORDING_TOO_SHORT' && msg !== 'RECORDING_CANCELLED') {
              setVoiceFeedback({ message: `Microphone error: ${msg}`, type: 'error' });
            }
          }
        });
    } catch (err: any) {
      setIsRecording(false);
      setTranscribing(false);
      setSilenceRemainingSec(null);
      setVoiceFeedback({ message: `Microphone error: ${err?.message || err}`, type: 'error' });
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      activeRecordingRef.current?.cancel();
    };
  }, []);

  // Clipboard paste support (screenshots Ctrl+V)
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.type.indexOf('image') !== -1) {
        const file = item?.getAsFile();
        if (file) {
          processFile(file);
        }
      }
    }
  };

  const processFile = (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');
    const isJson = file.name.endsWith('.json');
    const isCsv = file.name.endsWith('.csv');

    let attType: CopilotAttachment['type'] = 'text';
    if (isImage) attType = 'image';
    else if (isMarkdown) attType = 'markdown';
    else if (isJson) attType = 'json';
    else if (isCsv) attType = 'csv';

    const reader = new FileReader();

    if (isImage) {
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        addAttachment({
          id: crypto.randomUUID(),
          name: file.name,
          type: 'image',
          size: file.size,
          dataUrl,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (event) => {
        const textContent = event.target?.result as string;
        addAttachment({
          id: crypto.randomUUID(),
          name: file.name,
          type: attType,
          size: file.size,
          textContent,
        });
      };
      reader.readAsText(file);
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) processFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) processFile(file);
    }
  };

  // Quick suggestion chips based on active view
  const getSuggestions = () => {
    switch (currentView) {
      case 'profiles':
        return [
          'Bulk create 5 profiles with Sim Games niche',
          'Explain why profile trust score matters',
          'Distribute profiles across mixed engines',
        ];
      case 'tasks':
        return [
          'Draft YouTube search & watch task',
          'Create Amazon product search workflow',
          'Add cookie consent handler step',
        ];
      case 'niches':
        return [
          'Generate 15 high-intent keywords for Sim Racing',
          'Find seed URLs for PC Hardware niche',
        ];
      case 'runs':
      case 'logs':
        return [
          'Explain common cause of XPATH_TIMEOUT',
          'How does patience index affect my run speed?',
        ];
      default:
        return [
          'What can you do in TersooPilot?',
          'Create a new workflow task',
          'Check my LLM connection status',
        ];
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'fixed',
        right: '20px',
        bottom: '80px',
        width: '430px',
        height: '620px',
        maxHeight: 'calc(100vh - 110px)',
        borderRadius: '16px',
        backgroundColor: '#0c1222',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.15)',
        zIndex: 2147483590,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(30, 58, 138, 0.88)',
            border: '2px dashed #60a5fa',
            borderRadius: '16px',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: '#ffffff',
            pointerEvents: 'none',
          }}
        >
          <PaperclipIcon size={36} />
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Drop images, markdown, or specs here</span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <SparklesIcon size={16} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Tersoo Copilot</span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                LIVE
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              📍 Page: <strong style={{ color: '#cbd5e1' }}>{currentView.toUpperCase()}</strong>
              {selectedProfiles && selectedProfiles.length > 0 && ` (${selectedProfiles.length} selected)`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setHandsFreeLoop((prev) => !prev)}
            title={handsFreeLoop ? 'Hands-Free Auto-Pilot is Active (Click to pause)' : 'Hands-Free Auto-Pilot is Paused (Click to activate)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 9px',
              borderRadius: '20px',
              border: handsFreeLoop ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: handsFreeLoop ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: handsFreeLoop ? '#38bdf8' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: handsFreeLoop ? '#38bdf8' : '#64748b',
                boxShadow: handsFreeLoop ? '0 0 6px #38bdf8' : 'none',
              }}
            />
            <span>Auto-Pilot</span>
          </button>

          <button
            type="button"
            onClick={clearHistory}
            title="Clear Chat History"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <TrashIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close Copilot"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isEditing = editingMessageId === msg.id;
          const isCopied = copiedMessageId === msg.id;
          const timeFormatted = formatMessageDateTime(msg.timestamp);

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '100%',
              }}
            >
              {/* Message Bubble */}
              <div
                style={{
                  maxWidth: isEditing ? '96%' : '88%',
                  width: isEditing ? '100%' : 'auto',
                  padding: '10px 14px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  backgroundColor: isEditing ? '#0f172a' : (isUser ? '#2563eb' : '#1e293b'),
                  border: isEditing ? '1px solid #3b82f6' : (isUser ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)'),
                  color: '#f8fafc',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  wordBreak: 'break-word',
                  boxShadow: isEditing ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.25)',
                  transition: 'background-color 0.2s ease, border-color 0.2s ease',
                }}
              >
                {/* Render Attached Files Preview if User Message */}
                {isUser && msg.attachments && msg.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {msg.attachments.map((att) => (
                      <div
                        key={att.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0, 0, 0, 0.25)',
                          fontSize: '11px',
                          color: '#e2e8f0',
                        }}
                      >
                        {att.type === 'image' ? <ImageIcon size={12} /> : <FileTextIcon size={12} />}
                        <span>{att.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Editing Mode */}
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#93c5fd', fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <PencilIcon size={12} />
                        Editing message
                      </span>
                      <span style={{ color: '#64748b', fontSize: '10.5px', fontWeight: 'normal' }}>
                        Esc to cancel • Ctrl+Enter to save
                      </span>
                    </div>

                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          handleCancelEdit();
                        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          if (isUser) {
                            handleSaveAndResend(msg.id);
                          } else {
                            handleSaveEdit(msg.id);
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        minHeight: '75px',
                        maxHeight: '220px',
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '13px',
                        lineHeight: '1.4',
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                      autoFocus
                    />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          backgroundColor: 'transparent',
                          color: '#94a3b8',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(msg.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: 'rgba(255, 255, 255, 0.15)',
                          color: '#ffffff',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Save
                      </button>
                      {isUser && (
                        <button
                          type="button"
                          onClick={() => handleSaveAndResend(msg.id)}
                          disabled={loading}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#3b82f6',
                            color: '#ffffff',
                            fontSize: '11px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                          }}
                        >
                          <SendIcon size={11} />
                          Save & Resend
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Formatted Markdown Content */}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                    {/* Render Proposed Actions if Assistant Message */}
                    {!isUser && msg.actions && msg.actions.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        {msg.actions.map((action) => (
                          <CopilotActionCard key={action.id} action={action} onNavigate={onSelectView} />
                        ))}
                      </div>
                    )}

                    {/* Message Footer: Date/Time Stamp + Copy & Edit Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        marginTop: '8px',
                        paddingTop: '6px',
                        borderTop: isUser ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(255, 255, 255, 0.08)',
                        fontSize: '10.5px',
                      }}
                    >
                      {/* Date & Time Stamp */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: isUser ? 'rgba(255, 255, 255, 0.7)' : '#64748b',
                          userSelect: 'none',
                        }}
                        title={msg.timestamp ? new Date(msg.timestamp).toLocaleString() : undefined}
                      >
                        <ClockIcon size={11} />
                        <span>{timeFormatted}</span>
                      </div>

                      {/* Action buttons: Copy & Edit */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          title="Copy message content"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: isCopied ? 'rgba(16, 185, 129, 0.25)' : (isUser ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)'),
                            color: isCopied ? '#34d399' : (isUser ? 'rgba(255, 255, 255, 0.9)' : '#94a3b8'),
                            fontSize: '10.5px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isCopied ? (
                            <>
                              <CheckIcon size={11} style={{ color: '#34d399' }} />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <CopyIcon size={11} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(msg.id, msg.content)}
                          title="Edit message"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: isUser ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                            color: isUser ? 'rgba(255, 255, 255, 0.9)' : '#94a3b8',
                            fontSize: '10.5px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <PencilIcon size={11} />
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Thinking Indicator */}
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              fontSize: '12px',
              width: 'fit-content',
            }}
          >
            <SparklesIcon size={14} style={{ color: '#38bdf8' }} />
            <span>Tersoo Copilot is analyzing & formulating...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Action Chips (if idle) */}
      {!loading && messages.length <= 4 && (
        <div
          style={{
            padding: '6px 14px',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {getSuggestions().map((sugg, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setInputVal(sugg);
              }}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.12)')}
            >
              {sugg}
            </button>
          ))}
        </div>
      )}

      {/* Attachment Tray (Drafted Files ready to send) */}
      {attachments.length > 0 && (
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: '#0a0f1d',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          {attachments.map((att) => (
            <div
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '11px',
                color: '#f1f5f9',
              }}
            >
              {att.type === 'image' && att.dataUrl ? (
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  style={{ width: '18px', height: '18px', borderRadius: '3px', objectFit: 'cover' }}
                />
              ) : (
                <FileTextIcon size={14} style={{ color: '#38bdf8' }} />
              )}
              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.name}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '0 2px',
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={clearAttachments}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '2px 4px',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Voice Status & Visualizer Banner */}
      {isRecording && (
        <div
          style={{
            padding: '8px 14px',
            margin: '0 14px 4px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#fca5a5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                animation: 'pulse 1s infinite',
              }}
            />
            <span style={{ fontWeight: 600 }}>
              Listening... ({String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:
              {String(recordingDuration % 60).padStart(2, '0')})
            </span>
            {/* Live Audio Level Meter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px', marginLeft: '4px' }}>
              {[0.3, 0.6, 1.0, 0.5, 0.8, 0.4].map((mult, i) => (
                <span
                  key={i}
                  style={{
                    width: '3px',
                    height: `${Math.max(3, Math.min(14, (audioVolume / 60) * 14 * mult))}px`,
                    background: '#f87171',
                    borderRadius: '2px',
                    transition: 'height 0.08s ease',
                  }}
                />
              ))}
            </div>

            {/* Live Silence Countdown or Helpful Status */}
            {silenceRemainingSec !== null ? (
              <span style={{ fontSize: '11px', color: '#fef08a', fontWeight: 700, marginLeft: '6px' }}>
                ⏱ Pausing: sending in {silenceRemainingSec}s...
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginLeft: '6px' }}>
                (silence {((voice.commandSilenceStopMs || 5000) / 1000).toFixed(0)}s auto-sends)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={cancelVoiceRecording}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={stopVoiceRecording}
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '5px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Send Now
            </button>
          </div>
        </div>
      )}

      {transcribing && (
        <div
          style={{
            padding: '8px 14px',
            margin: '0 14px 4px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#fcd34d',
          }}
        >
          <span style={{ fontSize: '13px' }}>⏳</span>
          <span>Transcribing voice with Whisper model ({voice.sttModel || 'openai/whisper-large-v3'})...</span>
        </div>
      )}

      {isSpeakingReply && (
        <div
          style={{
            padding: '8px 14px',
            margin: '0 14px 4px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#a5b4fc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '3px', height: '12px', backgroundColor: '#818cf8', borderRadius: '2px', animation: 'pulse 0.8s infinite' }} />
            <span style={{ width: '3px', height: '16px', backgroundColor: '#818cf8', borderRadius: '2px', animation: 'pulse 0.8s infinite 0.2s' }} />
            <span style={{ width: '3px', height: '10px', backgroundColor: '#818cf8', borderRadius: '2px', animation: 'pulse 0.8s infinite 0.4s' }} />
          </div>
          <span>Tersoo speaking reply ({voice.ttsVoice || 'en_paul_neutral'})...</span>
        </div>
      )}

      {voiceFeedback && !isRecording && !transcribing && (
        <div
          style={{
            padding: '7px 12px',
            margin: '0 14px 4px',
            background:
              voiceFeedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.2)'
                : voiceFeedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(99, 102, 241, 0.2)',
            border: `1px solid ${
              voiceFeedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.4)'
                : voiceFeedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.4)'
                  : 'rgba(99, 102, 241, 0.4)'
            }`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color:
              voiceFeedback.type === 'error'
                ? '#fca5a5'
                : voiceFeedback.type === 'success'
                  ? '#6ee7b7'
                  : '#a5b4fc',
          }}
        >
          <span>{voiceFeedback.message}</span>
          <button
            type="button"
            onClick={() => setVoiceFeedback(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '15px',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Input Area */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0f172a',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFilesSelected}
          multiple
          accept="image/*,.md,.txt,.json,.csv"
          style={{ display: 'none' }}
        />

        {/* Paperclip Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload image, markdown, or data file"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s, background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#38bdf8';
            e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <PaperclipIcon size={18} />
        </button>

        {/* Microphone / Voice Button */}
        <button
          type="button"
          onClick={() => void toggleVoiceRecording()}
          disabled={transcribing}
          title={isRecording ? 'Stop recording voice command' : 'Speak voice command (Microphone)'}
          style={{
            background: isRecording ? 'rgba(239, 68, 68, 0.25)' : 'none',
            border: isRecording ? '1px solid rgba(239, 68, 68, 0.5)' : 'none',
            color: isRecording ? '#ef4444' : '#94a3b8',
            cursor: transcribing ? 'not-allowed' : 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isRecording) {
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isRecording) {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          <MicrophoneIcon size={18} />
        </button>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask Copilot, speak a voice command, or drop a file..."
          rows={2}
          style={{
            flex: 1,
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: isRecording ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '13px',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.4,
            transition: 'border-color 0.2s',
          }}
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || (!inputVal.trim() && attachments.length === 0)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: loading || (!inputVal.trim() && attachments.length === 0) ? '#334155' : '#3b82f6',
            color: '#ffffff',
            border: 'none',
            cursor: loading || (!inputVal.trim() && attachments.length === 0) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s',
          }}
        >
          <SendIcon size={16} />
        </button>
      </div>
    </div>
  );
}
