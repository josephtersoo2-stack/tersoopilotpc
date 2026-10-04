-- migrations/0004_persona_trust_and_multi_niche.sql
-- Adds trust score, maturation stage, keystroke dynamics, and multi-niche support to profiles.

ALTER TABLE profiles ADD COLUMN trust_score INTEGER NOT NULL DEFAULT 10;
ALTER TABLE profiles ADD COLUMN maturation_stage TEXT NOT NULL DEFAULT 'infant';
ALTER TABLE profiles ADD COLUMN typing_wpm INTEGER NOT NULL DEFAULT 70;
ALTER TABLE profiles ADD COLUMN typo_rate REAL NOT NULL DEFAULT 0.03;
ALTER TABLE profiles ADD COLUMN patience_index REAL NOT NULL DEFAULT 5.5;
ALTER TABLE profiles ADD COLUMN engagement_rate REAL NOT NULL DEFAULT 0.20;
ALTER TABLE profiles ADD COLUMN niche_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN weighted_niches TEXT NOT NULL DEFAULT '[]';
