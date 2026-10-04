import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeIpc } from '../lib/ipc';
import { createAudioFromBase64 } from '../utils/audioPlayer';

export function useAgentSpeak(opts: { voice: string; model: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stop();
      const cleaned = text.trim();
      if (!cleaned) return;

      try {
        const result = await invokeIpc('voice.speak', {
          text: cleaned.slice(0, 4000),
          voice: opts.voice || 'en_paul_neutral',
          model: opts.model || 'mistralai/voxtral-mini-tts-2603',
          responseFormat: 'mp3',
        });

        if (result?.audio) {
          const { audio, cleanup } = createAudioFromBase64(result.audio, result.format ?? 'mp3');
          audioRef.current = audio;
          cleanupRef.current = cleanup;
          audio.onplay = () => setSpeaking(true);
          audio.onended = () => {
            setSpeaking(false);
            audioRef.current = null;
            cleanupRef.current = null;
            cleanup();
          };
          audio.onerror = () => {
            setSpeaking(false);
            audioRef.current = null;
            cleanupRef.current = null;
            cleanup();
          };
          await audio.play();
        }
      } catch (err) {
        console.error('[Voice] TTS playback failed:', err);
        setSpeaking(false);
      }
    },
    [opts.voice, opts.model, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { speak, stop, speaking };
}
