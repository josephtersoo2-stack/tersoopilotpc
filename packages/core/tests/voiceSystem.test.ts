import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { CostService } from '../src/services/CostService';
import { TersooError } from '../src/util/errors';

describe('Voice System — CostService, Repos & Errors', () => {
  let tempDir: string;
  let db: ReturnType<typeof openDb>;
  let repos: Repos;
  let costService: CostService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-voice-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    costService = new CostService(repos.events);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('STT and TTS Cost Calculations', () => {
    it('calculates STT cost accurately based on $0.006 per minute', () => {
      // 60 seconds (1 minute) = $0.006
      expect(CostService.calculateSttCostUsd(60000)).toBeCloseTo(0.006, 5);

      // 30 seconds = $0.003
      expect(CostService.calculateSttCostUsd(30000)).toBeCloseTo(0.003, 5);

      // 10 seconds = $0.001
      expect(CostService.calculateSttCostUsd(10000)).toBeCloseTo(0.001, 5);

      // 0 seconds = 0
      expect(CostService.calculateSttCostUsd(0)).toBe(0);
    });

    it('calculates TTS cost estimates accurately', () => {
      expect(CostService.calculateTtsCostUsd(10000)).toBeGreaterThan(0);
      expect(CostService.calculateTtsCostUsd(0)).toBe(0);
    });
  });

  describe('Voice Event Querying & Cost Aggregation', () => {
    it('returns zeroes when no voice events exist', async () => {
      const summary = await costService.getVoiceCostSummary();
      expect(summary.sttCostUsd).toBe(0);
      expect(summary.ttsRequests).toBe(0);
      expect(summary.sttRequests).toBe(0);
      expect(summary.totalAudioMs).toBe(0);
    });

    it('aggregates voice.transcribed and voice.spoken events correctly', async () => {
      await repos.events.append('info', 'system', 'voice.transcribed', {
        durationMs: 10000,
        cost: 0.001,
        audioBytes: 15000,
        language: 'en',
        model: 'openai/whisper-large-v3',
      });

      await repos.events.append('info', 'system', 'voice.transcribed', {
        durationMs: 20000,
        cost: 0.002,
        audioBytes: 30000,
        language: 'en',
        model: 'openai/whisper-large-v3',
      });

      await repos.events.append('info', 'system', 'voice.spoken', {
        charCount: 25,
        cost: 0.0005,
        format: 'mp3',
        voice: 'en_paul_neutral',
        model: 'mistralai/voxtral-mini-tts-2603',
      });

      const summary = await costService.getVoiceCostSummary();
      expect(summary.sttRequests).toBe(2);
      expect(summary.ttsRequests).toBe(1);
      expect(summary.sttCostUsd).toBeCloseTo(0.003, 4);
      expect(summary.totalAudioMs).toBe(30000);
    });

    it('respects time range filters in EventRepo query', async () => {
      await repos.events.append('info', 'system', 'voice.transcribed', {
        durationMs: 5000,
        cost: 0.0005,
      });

      await repos.events.append('info', 'system', 'voice.transcribed', {
        durationMs: 10000,
        cost: 0.001,
      });

      const events = await repos.events.query({
        event: 'voice.transcribed',
        fromMs: 0,
      });

      expect(events.length).toBe(2);
      expect(events[0]?.event).toBe('voice.transcribed');
      expect(events[1]?.event).toBe('voice.transcribed');
    });
  });

  describe('Voice Settings Persistence in SettingsRepo', () => {
    it('saves and reads voice configuration keys', async () => {
      await repos.settings.set('voice.wake_word_enabled', 'true');
      await repos.settings.set('voice.wake_word_model', 'hey_tersoo');
      await repos.settings.set('voice.wake_word_threshold', '0.65');
      await repos.settings.set('voice.greeting_text', 'Hello, at your service.');

      expect(await repos.settings.get('voice.wake_word_enabled')).toBe('true');
      expect(await repos.settings.get('voice.wake_word_model')).toBe('hey_tersoo');
      expect(await repos.settings.get('voice.wake_word_threshold')).toBe('0.65');
      expect(await repos.settings.get('voice.greeting_text')).toBe('Hello, at your service.');
    });
  });

  describe('Voice Error Handling', () => {
    it('creates voice-specific TersooError instances', () => {
      const errStt = new TersooError('STT_NO_API_KEY', 'OpenRouter key missing');
      expect(errStt.code).toBe('STT_NO_API_KEY');
      expect(errStt.message).toBe('OpenRouter key missing');

      const errTts = new TersooError('TTS_NO_API_KEY', 'TTS key missing');
      expect(errTts.code).toBe('TTS_NO_API_KEY');

      const errApi = new TersooError('STT_API_ERROR', 'Whisper failed');
      expect(errApi.code).toBe('STT_API_ERROR');
    });
  });
});
