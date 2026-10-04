/**
 * Audio playback utility for base64-encoded audio responses (TTS).
 * Ensures correct MIME mapping (e.g. mp3 -> audio/mpeg) and uses
 * Blob URLs with Web Audio API fallbacks to prevent "no supported source" errors in Chromium/Electron.
 */

export function getAudioMimeType(format?: string): string {
  if (!format) return 'audio/mpeg';
  const f = format.toLowerCase().trim();
  switch (f) {
    case 'mp3':
    case 'mpeg':
      return 'audio/mpeg';
    case 'wav':
    case 'wave':
      return 'audio/wav';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'webm':
      return 'audio/webm';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    default:
      return `audio/${f}`;
  }
}

/**
 * Converts a base64 string into a Uint8Array byte buffer safely.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // Strip potential data URL prefix and whitespace
  const cleaned = (base64.includes(',') ? base64.split(',')[1]! : base64)
    .trim()
    .replace(/\s+/g, '');
  const binaryString = window.atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Creates an HTMLAudioElement using a properly MIME-typed Blob URL.
 * Returns the audio instance and a cleanup function to revoke the Blob URL when finished.
 */
export function createAudioFromBase64(
  base64Data: string,
  format = 'mp3',
): { audio: HTMLAudioElement; cleanup: () => void; blobUrl: string } {
  const mime = getAudioMimeType(format);
  const bytes = base64ToUint8Array(base64Data);
  const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuf], { type: mime });
  const blobUrl = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.src = blobUrl;

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore cleanup errors
    }
  };

  return { audio, cleanup, blobUrl };
}

/**
 * Plays base64 audio with Blob URL and Web Audio API fallback.
 * Resolves when playback finishes, or rejects if unplayable.
 */
export async function playBase64Audio(base64Data?: string | null, format = 'mp3'): Promise<void> {
  if (!base64Data || typeof base64Data !== 'string' || !base64Data.trim()) {
    throw new Error('No audio data received for playback.');
  }

  const bytes = base64ToUint8Array(base64Data);
  if (bytes.byteLength === 0) {
    throw new Error('Audio payload is empty.');
  }

  // Attempt 1: Standard HTMLAudioElement using Blob URL with explicit audio/mpeg MIME
  try {
    const { audio, cleanup } = createAudioFromBase64(base64Data, format);

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error(audio.error?.message || 'Audio element decode error'));
      };
      audio.play().catch((err) => {
        cleanup();
        reject(err);
      });
    });
    return;
  } catch (blobErr) {
    console.warn('[playBase64Audio] Blob URL playback failed, trying Web Audio API fallback:', blobErr);
  }

  // Attempt 2: Web Audio API (direct binary decoding via AudioContext)
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const bufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const audioBuffer = await audioCtx.decodeAudioData(bufferCopy);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start(0);

      await new Promise<void>((resolve) => {
        source.onended = () => {
          void audioCtx.close();
          resolve();
        };
      });
      return;
    }
  } catch (webAudioErr) {
    console.error('[playBase64Audio] Web Audio fallback failed:', webAudioErr);
  }

  throw new Error('Audio playback failed: unable to decode audio source.');
}
