export interface RecordOptions {
  maxDurationMs?: number;
  silenceStopMs?: number;
  minDurationMs?: number;
  initialSilenceTimeoutMs?: number;
  onVolumeChange?: (volume: number) => void;
  onSilenceCountdown?: (remainingSec: number) => void;
  onSpeechDetected?: () => void;
}

export interface ActiveRecording {
  stop: () => Promise<Blob>;
  cancel: () => void;
  promise: Promise<Blob>;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    '',
  ];
  for (const c of candidates) {
    if (c === '' || MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return '';
}

/**
 * Starts an active microphone recording session with real-time volume analysis,
 * automatic silence detection, and manual stop/cancel controls.
 */
export function startCommandRecording(opts: RecordOptions = {}): ActiveRecording {
  const maxDurationMs = opts.maxDurationMs ?? 300000;
  const silenceStopMs = opts.silenceStopMs ?? 5000;
  const initialSilenceTimeoutMs = opts.initialSilenceTimeoutMs ?? 10000;
  const minDurationMs = opts.minDurationMs ?? 400;

  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let silenceInterval: any = null;
  let volumeInterval: any = null;

  let resolvePromise!: (blob: Blob) => void;
  let rejectPromise!: (err: Error) => void;

  const promise = new Promise<Blob>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  let stopped = false;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let hasDetectedSpeech = false;
  let lastSpeechAt = 0;

  const cleanup = () => {
    if (silenceInterval) {
      clearInterval(silenceInterval);
      silenceInterval = null;
    }
    if (volumeInterval) {
      clearInterval(volumeInterval);
      volumeInterval = null;
    }
    if (sourceNode && analyserNode) {
      try {
        sourceNode.disconnect();
        analyserNode.disconnect();
      } catch {}
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        void audioContext.close();
      } catch {}
      audioContext = null;
    }
    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStream = null;
    }
  };

  const stop = async (): Promise<Blob> => {
    if (stopped) return promise;
    stopped = true;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.stop();
      } catch {}
    } else {
      cleanup();
      if (chunks.length > 0) {
        resolvePromise(new Blob(chunks, { type: 'audio/webm' }));
      } else {
        rejectPromise(new Error('RECORDING_EMPTY'));
      }
    }

    return promise;
  };

  const cancel = () => {
    if (stopped) return;
    stopped = true;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.stop();
      } catch {}
    }
    cleanup();
    rejectPromise(new Error('RECORDING_CANCELLED'));
  };

  // Launch capture asynchronously
  void (async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MICROPHONE_UNSUPPORTED: MediaDevices API is not supported in this environment.');
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err: any) {
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          throw new Error('MICROPHONE_PERMISSION_DENIED: Microphone access was denied. Please grant microphone permission in Windows Settings.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          throw new Error('MICROPHONE_NOT_FOUND: No microphone detected on this computer.');
        } else {
          throw new Error(`MICROPHONE_ERROR: ${err?.message || String(err)}`);
        }
      }

      if (stopped) {
        cleanup();
        return;
      }

      const AudioCtx = globalThis.AudioContext || (globalThis as any).webkitAudioContext;
      audioContext = new AudioCtx({ sampleRate: 16000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 512;
      sourceNode.connect(analyserNode);

      const mimeType = getSupportedMimeType();
      mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      chunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanup();
        const duration = Date.now() - startedAt;
        if (duration < minDurationMs && chunks.length === 0) {
          rejectPromise(new Error('RECORDING_TOO_SHORT'));
          return;
        }
        const blobType = mimeType || 'audio/webm';
        const finalBlob = new Blob(chunks, { type: blobType });
        resolvePromise(finalBlob);
      };

      startedAt = Date.now();
      lastSpeechAt = startedAt;
      mediaRecorder.start(100);

      const dataArray = new Uint8Array(analyserNode.fftSize);

      // Volume tracking & silence check loop
      silenceInterval = setInterval(() => {
        if (stopped || !analyserNode) return;

        analyserNode.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] ?? 128;
          sum += (v - 128) ** 2;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Normalize approx 0 - 100 for visualizers
        const normalizedVolume = Math.min(100, Math.round((rms / 32) * 100));
        opts.onVolumeChange?.(normalizedVolume);

        const now = Date.now();

        // Speech detection threshold (RMS > 6 considered active voice)
        if (rms > 6) {
          hasDetectedSpeech = true;
          lastSpeechAt = now;
          opts.onSpeechDetected?.();
          opts.onSilenceCountdown?.(Math.ceil(silenceStopMs / 1000));
        }

        // If user spoke and is pausing, calculate remaining silence before auto-send
        if (hasDetectedSpeech) {
          const silenceElapsed = now - lastSpeechAt;
          const remainingMs = Math.max(0, silenceStopMs - silenceElapsed);
          const remainingSec = Math.ceil(remainingMs / 1000);
          opts.onSilenceCountdown?.(remainingSec);

          if (silenceElapsed > silenceStopMs) {
            void stop();
            return;
          }
        }

        // If user hasn't started speaking within initial window
        if (!hasDetectedSpeech && now - startedAt > initialSilenceTimeoutMs) {
          void stop();
          return;
        }

        // Hard cap at max duration
        if (now - startedAt > maxDurationMs) {
          void stop();
          return;
        }
      }, 80);
    } catch (err: any) {
      cleanup();
      rejectPromise(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return { stop, cancel, promise };
}

/**
 * Convenience wrapper for one-shot command recording.
 */
export async function recordCommand(opts: RecordOptions = {}): Promise<Blob> {
  const recording = startCommandRecording(opts);
  return recording.promise;
}
