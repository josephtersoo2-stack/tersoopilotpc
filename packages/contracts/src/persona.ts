import { z } from 'zod';

export const PersonaPresetKey = z.enum(['casual', 'gamer', 'researcher', 'skimmer', 'custom']);
export type PersonaPresetKey = z.infer<typeof PersonaPresetKey>;

export const PersonaConfig = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  typingWpm: z.number().int().min(15).max(120).default(50),
  typoRate: z.number().min(0).max(0.15).default(0.02),
  mouseCurvature: z.enum(['low', 'natural', 'high']).default('natural'),
  hesitationMs: z.object({
    min: z.number().int().default(150),
    max: z.number().int().default(350),
  }),
  readingMultiplier: z.number().min(0.2).max(3.0).default(1.0),
});
export type PersonaConfig = z.infer<typeof PersonaConfig>;

export const PERSONA_PRESETS: Record<PersonaPresetKey, PersonaConfig> = {
  casual: {
    id: 'casual',
    name: 'The Casual Consumer',
    description: 'Natural browsing cadence, relaxed Bézier mouse curves, 45-55 WPM typing with standard pauses.',
    typingWpm: 50,
    typoRate: 0.02,
    mouseCurvature: 'natural',
    hesitationMs: { min: 150, max: 350 },
    readingMultiplier: 1.0,
  },
  gamer: {
    id: 'gamer',
    name: 'The Gamer / Tech Native',
    description: 'Fast reflexes, snappy mouse trajectories, 70-85 WPM typing, short hesitations before clicks.',
    typingWpm: 75,
    typoRate: 0.01,
    mouseCurvature: 'low',
    hesitationMs: { min: 80, max: 200 },
    readingMultiplier: 0.7,
  },
  researcher: {
    id: 'researcher',
    name: 'The Methodical Researcher',
    description: 'Deliberate, thorough scrolling, curvier mouse wander, 35-45 WPM typing, longer pauses to read content.',
    typingWpm: 40,
    typoRate: 0.03,
    mouseCurvature: 'high',
    hesitationMs: { min: 250, max: 600 },
    readingMultiplier: 1.4,
  },
  skimmer: {
    id: 'skimmer',
    name: 'The Fast Skimmer',
    description: 'Aggressive scrolling, brisk mouse gliding, 60-70 WPM typing, quick scan of pages.',
    typingWpm: 65,
    typoRate: 0.02,
    mouseCurvature: 'natural',
    hesitationMs: { min: 100, max: 250 },
    readingMultiplier: 0.6,
  },
  custom: {
    id: 'custom',
    name: 'Custom Persona',
    description: 'Customized persona behavior configured by profile.',
    typingWpm: 50,
    typoRate: 0.02,
    mouseCurvature: 'natural',
    hesitationMs: { min: 150, max: 350 },
    readingMultiplier: 1.0,
  },
};
