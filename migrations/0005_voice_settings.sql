-- migrations/0005_voice_settings.sql
-- Default configuration for hands-free wake word, STT, and TTS voice system.

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('voice.stt_model', '"openai/whisper-large-v3"', strftime('%s','now')*1000),
  ('voice.stt_language', 'null', strftime('%s','now')*1000),
  ('voice.tts_model', '"mistralai/voxtral-mini-tts-2603"', strftime('%s','now')*1000),
  ('voice.tts_voice', '"en_paul_neutral"', strftime('%s','now')*1000),
  ('voice.auto_speak', 'true', strftime('%s','now')*1000),
  ('voice.wake_word_enabled', 'true', strftime('%s','now')*1000),
  ('voice.wake_word_model', '"hey_tersoo"', strftime('%s','now')*1000),
  ('voice.wake_word_threshold', '0.5', strftime('%s','now')*1000),
  ('voice.greeting_text', '"Yes, how can I help?"', strftime('%s','now')*1000),
  ('voice.command_max_duration_ms', '10000', strftime('%s','now')*1000),
  ('voice.command_silence_stop_ms', '1200', strftime('%s','now')*1000);
