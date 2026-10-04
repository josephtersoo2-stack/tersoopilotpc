import { useEffect, useRef, useState, useCallback } from 'react';
import { useWakeWord } from '../hooks/useWakeWord';
import { useSettingsStore } from '../stores/settingsStore';
import { useCopilotStore } from '../stores/copilotStore';
import { recordCommand } from '../utils/commandRecorder';
import { invokeIpc, subscribeIpc } from '../lib/ipc';
import { createAudioFromBase64 } from '../utils/audioPlayer';
import { playChime, type ChimeType } from '../utils/chimePlayer';

type VoiceState = 'idle' | 'greeting' | 'recording' | 'transcribing' | 'speaking';

export function WakeIndicator() {
  const { voice } = useSettingsStore();
  const copilotStore = useCopilotStore();

  const [state, setState] = useState<VoiceState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const greetingAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any active TTS or greeting playback (Cross-phase Rule 4)
  const stopAllAudio = useCallback(() => {
    if (greetingAudioRef.current) {
      greetingAudioRef.current.pause();
      greetingAudioRef.current.currentTime = 0;
      greetingAudioRef.current = null;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current = null;
    }
  }, []);

  // Speak assistant text
  const speakText = useCallback(
    async (text: string) => {
      if (!voice.autoSpeak || !text.trim()) return;
      stopAllAudio();
      setState('speaking');

      try {
        const res = await invokeIpc('voice.speak', {
          text: text.slice(0, 4000),
          voice: voice.ttsVoice || 'en_paul_neutral',
          model: voice.ttsModel || 'mistralai/voxtral-mini-tts-2603',
          responseFormat: 'mp3',
        });

        if (res?.audio) {
          const { audio, cleanup } = createAudioFromBase64(res.audio, res.format ?? 'mp3');
          ttsAudioRef.current = audio;
          audio.onended = () => {
            setState('idle');
            ttsAudioRef.current = null;
            cleanup();
          };
          audio.onerror = () => {
            setState('idle');
            ttsAudioRef.current = null;
            cleanup();
          };
          await audio.play();
        } else {
          setState('idle');
        }
      } catch (err) {
        console.error('[Voice] Auto-speak failed:', err);
        setState('idle');
      }
    },
    [voice.autoSpeak, voice.ttsVoice, voice.ttsModel, stopAllAudio],
  );

  // Wake word detection handler
  const handleWakeDetected = useCallback(async () => {
    console.log('[Voice] Wake word triggered, requesting wake orchestration...');
    stopAllAudio();
    playChime(((voice as any).chimeSound || 'pleasant') as ChimeType);
    copilotStore.setOpen(true);
    setState('greeting');
    setErrorMessage(null);

    try {
      await invokeIpc('voice.wake_detected', {});
    } catch (err) {
      console.error('[Voice] wake_detected IPC failed:', err);
      setState('idle');
    }
  }, [stopAllAudio, voice, copilotStore]);

  const { listening, initError } = useWakeWord({
    enabled: voice.wakeWordEnabled,
    wakeWordModel: voice.wakeWordModel || 'hey_tersoo',
    threshold: voice.wakeWordThreshold ?? 0.5,
    onDetected: handleWakeDetected,
    onError: (err) => {
      setErrorMessage(err.message);
    },
  });

  // Wire up greeting and recording events from main process
  useEffect(() => {
    const unsubGreeting = (window as any).tersoo?.on?.(
      'voice.greeting',
      async (data: { audio: string; format: string; durationMs: number }) => {
        setState('greeting');
        stopAllAudio();

        if (data?.audio) {
          const { audio, cleanup } = createAudioFromBase64(data.audio, data.format ?? 'mp3');
          greetingAudioRef.current = audio;
          audio.onended = () => {
            greetingAudioRef.current = null;
            cleanup();
          };
          audio.onerror = () => {
            greetingAudioRef.current = null;
            cleanup();
          };
          try {
            await audio.play();
          } catch (e) {
            console.warn('[Voice] Greeting autoplay blocked or failed:', e);
            cleanup();
          }
        }
      },
    );

    const unsubStartRecording = (window as any).tersoo?.on?.(
      'voice.start_recording',
      async (opts: { maxDurationMs: number; silenceStopMs: number }) => {
        stopAllAudio();
        setState('recording');

        try {
          const blob = await recordCommand({
            maxDurationMs: opts?.maxDurationMs || voice.commandMaxDurationMs || 300000,
            silenceStopMs: opts?.silenceStopMs || voice.commandSilenceStopMs || 5000,
            minDurationMs: 400,
          });

          setState('transcribing');

          const arrayBuffer = await blob.arrayBuffer();
          const transcript = await invokeIpc('voice.transcribe', {
            audio: new Uint8Array(arrayBuffer),
            format: 'webm',
            language: voice.sttLanguage,
            model: voice.sttModel,
          });

          const recognizedText = transcript.text?.trim();
          if (recognizedText) {
            console.log('[Voice] Transcript received:', recognizedText);
            playChime('send');

            // Open Copilot drawer & send message to agent
            copilotStore.setOpen(true);
            await copilotStore.sendMessage(recognizedText, {
              activeView: 'voice_command',
            });

            // Get the newly generated assistant reply to auto-speak
            const messages = useCopilotStore.getState().messages;
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && voice.autoSpeak) {
              void speakText(lastMsg.content);
            } else {
              setState('idle');
            }
          } else {
            console.log('[Voice] Empty transcript discarded silently');
            setState('idle');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg !== 'RECORDING_TOO_SHORT') {
            console.error('[Voice] Command recording / transcription failed:', err);
            setErrorMessage(msg);
          }
          setState('idle');
        }
      },
    );

    return () => {
      unsubGreeting?.();
      unsubStartRecording?.();
      stopAllAudio();
    };
  }, [voice, copilotStore, stopAllAudio, speakText]);

  if (!voice.wakeWordEnabled) {
    return null;
  }

  // Visual status label & colors
  const statusConfig = {
    idle: {
      text: listening ? 'Listening: "Hey Tersoo"' : 'Starting listener...',
      dotClass: listening ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse' : 'bg-zinc-500',
      badgeClass: 'border-zinc-700/60 bg-zinc-900/80 text-zinc-300',
    },
    greeting: {
      text: 'Yes, how can I help?',
      dotClass: 'bg-cyan-400 shadow-[0_0_10px_#22d3ee] animate-bounce',
      badgeClass: 'border-cyan-500/40 bg-cyan-950/80 text-cyan-200',
    },
    recording: {
      text: 'Listening to command...',
      dotClass: 'bg-rose-500 shadow-[0_0_12px_#f43f5e] animate-ping',
      badgeClass: 'border-rose-500/50 bg-rose-950/85 text-rose-200 ring-2 ring-rose-500/20',
    },
    transcribing: {
      text: 'Transcribing speech...',
      dotClass: 'bg-amber-400 shadow-[0_0_10px_#fbbf24] animate-spin',
      badgeClass: 'border-amber-500/40 bg-amber-950/80 text-amber-200',
    },
    speaking: {
      text: 'Assistant speaking...',
      dotClass: 'bg-indigo-400 shadow-[0_0_10px_#818cf8] animate-pulse',
      badgeClass: 'border-indigo-500/40 bg-indigo-950/80 text-indigo-200',
    },
  }[state];

  return (
    <div
      onClick={() => {
        copilotStore.setOpen(true);
      }}
      className="fixed bottom-3 right-24 z-40 select-none pointer-events-auto cursor-pointer transition-all duration-300 ease-out hover:scale-105 active:scale-95"
      style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.45))' }}
      title={
        errorMessage || initError
          ? `Voice error: ${errorMessage || initError}. Click to open Copilot.`
          : 'Hands-free voice active. Click to open Copilot Chat.'
      }
    >
      <div
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border shadow-lg transition-colors ${statusConfig.badgeClass}`}
      >
        <div className="relative flex items-center justify-center w-2.5 h-2.5">
          <span className={`w-2 h-2 rounded-full transition-all ${statusConfig.dotClass}`} />
        </div>
        <span className="tracking-wide">{statusConfig.text}</span>
        {state === 'recording' && (
          <div className="flex items-center gap-0.5 ml-1">
            <span className="w-1 h-2 bg-rose-400 rounded-full animate-pulse" />
            <span className="w-1 h-3.5 bg-rose-400 rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="w-1 h-2 bg-rose-400 rounded-full animate-pulse [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}
