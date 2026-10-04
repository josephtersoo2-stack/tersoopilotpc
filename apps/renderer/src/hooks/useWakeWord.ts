import { useEffect, useRef, useState, useCallback } from 'react';
import { OpenWakeWord, configureOrt } from 'openwakeword-web';
import { Microphone } from 'openwakeword-web/microphone';

export interface UseWakeWordOptions {
  enabled: boolean;
  wakeWordModel: string;
  threshold: number;
  onDetected: () => void;
  onError?: (err: Error) => void;
}

export function useWakeWord(opts: UseWakeWordOptions) {
  const owwRef = useRef<OpenWakeWord | null>(null);
  const micRef = useRef<Microphone | null>(null);
  const [listening, setListening] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Rate limiting / cooldown refs
  const lastDetectedAtRef = useRef<number>(0);
  const recentDetectionsRef = useRef<number[]>([]);

  const start = useCallback(async () => {
    if (owwRef.current || micRef.current) return;
    setInitError(null);

    try {
      // Dynamically resolve relative asset paths based on page origin / protocol
      const baseUrl = new URL('./openwakeword/models/', window.location.href).href;
      const ortWasmPath = new URL('./openwakeword/ort/', window.location.href).href;

      // Configure local WASM paths
      configureOrt({
        wasmPaths: ortWasmPath,
      });

      const modelKey = optsRef.current.wakeWordModel || 'hey_tersoo';
      const threshold = optsRef.current.threshold ?? 0.5;

      // Map models to exact filenames in models/ directory
      const modelFiles: Record<string, string> = {
        hey_tersoo: 'hey_tersoo.onnx',
        hey_jarvis: 'hey_jarvis_v0.1.onnx',
        alexa: 'alexa_v0.1.onnx',
        hey_mycroft: 'hey_mycroft_v0.1.onnx',
        hey_rhasspy: 'hey_rhasspy_v0.1.onnx',
        weather: 'weather_v0.1.onnx',
        timer: 'timer_v0.1.onnx',
      };
      const modelFilename = modelFiles[modelKey] || (modelKey.endsWith('.onnx') ? modelKey : `${modelKey}.onnx`);

      const oww = await OpenWakeWord.create({
        baseUrl,
        melspectrogramUrl: `${baseUrl}melspectrogram.onnx`,
        embeddingUrl: `${baseUrl}embedding_model.onnx`,
        wakewordModels: [
          {
            name: modelKey,
            url: `${baseUrl}${modelFilename}`,
          },
        ],
        threshold,
        onDetection: ({ label, score }) => {
          if (score >= (optsRef.current.threshold ?? 0.5)) {
            const now = Date.now();

            // Cross-phase Rule 5: 1.5s cooldown
            if (now - lastDetectedAtRef.current < 1500) {
              return;
            }

            // Edge case: max 2 fires per 10s
            recentDetectionsRef.current = recentDetectionsRef.current.filter((t) => now - t < 10000);
            if (recentDetectionsRef.current.length >= 2) {
              console.warn('[Voice] Wake word detected >2 times in 10s — ignoring extra fire');
              return;
            }

            lastDetectedAtRef.current = now;
            recentDetectionsRef.current.push(now);

            console.log(`[Voice] Wake word detected: ${label} (score: ${score.toFixed(2)})`);
            optsRef.current.onDetected();
          }
        },
      });

      // Inline AudioWorklet processor code to avoid file:// security blocks
      const PCM_WORKLET_CODE = `
        const TARGET_RATE = 16000;
        const FRAME = 1280;
        class PCMWorklet extends AudioWorkletProcessor {
          constructor() {
            super();
            this._ratio = sampleRate / TARGET_RATE;
            this._buf = new Int16Array(FRAME);
            this._n = 0;
            this._tail = new Float32Array(0);
            this._frac = 0;
          }
          process(inputs) {
            const channel = inputs[0]?.[0];
            if (!channel) return true;
            let data = channel;
            if (this._tail.length) {
              data = new Float32Array(this._tail.length + channel.length);
              data.set(this._tail, 0);
              data.set(channel, this._tail.length);
            }
            const ratio = this._ratio;
            let t = this._frac;
            while (Math.floor(t) + 1 < data.length) {
              const i = Math.floor(t);
              const frac = t - i;
              const s = data[i] + (data[i + 1] - data[i]) * frac;
              let v = Math.floor(32767 * s);
              if (v > 32767) v = 32767;
              else if (v < -32768) v = -32768;
              this._buf[this._n++] = v;
              if (this._n === FRAME) {
                this.port.postMessage(this._buf.slice());
                this._n = 0;
              }
              t += ratio;
            }
            const keepFrom = Math.floor(t);
            this._tail = data.slice(keepFrom);
            this._frac = t - keepFrom;
            return true;
          }
        }
        registerProcessor("pcm-worklet", PCMWorklet);
      `;

      const workletBlob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
      const workletBlobUrl = URL.createObjectURL(workletBlob);

      const mic = new Microphone(
        async (frame) => {
          if (owwRef.current) {
            try {
              await owwRef.current.predict(frame);
            } catch (err) {
              // ignore transient prediction errors during shutdown
            }
          }
        },
        { workletUrl: workletBlobUrl },
      );

      await mic.start();

      owwRef.current = oww;
      micRef.current = mic;
      setListening(true);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[Voice] Failed to start wake word detector:', error);
      setInitError(error.message);
      setListening(false);
      optsRef.current.onError?.(error);
    }
  }, []);

  const stop = useCallback(async () => {
    if (micRef.current) {
      try {
        await micRef.current.stop();
      } catch {}
      micRef.current = null;
    }
    owwRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    if (opts.enabled) {
      void start();
    } else {
      void stop();
    }

    return () => {
      void stop();
    };
  }, [opts.enabled, opts.wakeWordModel, opts.threshold, start, stop]);

  return { listening, initError, start, stop };
}
