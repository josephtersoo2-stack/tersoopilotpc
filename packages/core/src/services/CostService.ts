import type { EventRepo } from '../persistence/repos/eventRepo';
import type { VoiceCostSummary } from '@tersoo/contracts';

export class CostService {
  constructor(private events: EventRepo) {}

  /**
   * Whisper Large v3 on OpenRouter: $0.006 per minute ($0.0001 per second)
   */
  static calculateSttCostUsd(durationMs: number): number {
    if (durationMs <= 0) return 0;
    return (durationMs / 60000) * 0.006;
  }

  /**
   * Voxtral Mini TTS on OpenRouter: ~$0.001 per 1,000 characters
   */
  static calculateTtsCostUsd(charCount: number): number {
    if (charCount <= 0) return 0;
    return (charCount / 1000) * 0.001;
  }

  async getVoiceCostSummary(range?: { fromMs?: number; toMs?: number }): Promise<VoiceCostSummary> {
    const fromMs = range?.fromMs ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toMs = range?.toMs ?? Date.now();

    const sttEvents = await this.events.query({ event: 'voice.transcribed', fromMs, toMs });
    const ttsEvents = await this.events.query({ event: 'voice.spoken', fromMs, toMs });

    let sttCostUsd = 0;
    let totalAudioMs = 0;

    for (const e of sttEvents) {
      try {
        const parsed = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (parsed) {
          sttCostUsd += Number(parsed.cost ?? parsed.costUsd) || 0;
          totalAudioMs += Number(parsed.durationMs) || 0;
        }
      } catch {
        // Skip unparseable records safely
      }
    }

    return {
      sttCostUsd: Math.round(sttCostUsd * 10000) / 10000,
      ttsRequests: ttsEvents.length,
      sttRequests: sttEvents.length,
      totalAudioMs,
    };
  }
}
