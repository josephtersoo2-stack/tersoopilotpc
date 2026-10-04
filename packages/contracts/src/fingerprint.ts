import { z } from 'zod';

import { Platform } from './primitives';

export const FingerprintBundle = z.object({
  seed: z.string().min(8),
  platform: Platform,
  userAgent: z.string().min(20),
  uaMetadata: z.object({
    brands: z.array(z.object({ brand: z.string(), version: z.string() })),
    platform: z.string(),
    platformVersion: z.string(),
    architecture: z.string(),
    model: z.string(),
    mobile: z.boolean(),
  }),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    availWidth: z.number().int().positive(),
    availHeight: z.number().int().positive(),
    colorDepth: z.number().int().min(16).max(48),
    dpr: z.number().min(1).max(4),
  }),
  webgl: z.object({
    vendor: z.string(),
    renderer: z.string(),
    unmaskedVendor: z.string(),
    unmaskedRenderer: z.string(),
  }),
  canvasNoise: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['perlin', 'gaussian', 'uniform']),
    intensity: z.number().min(0).max(1),
  }),
  audioNoise: z.object({
    enabled: z.boolean(),
    algorithm: z.enum(['gaussian', 'uniform']),
    intensity: z.number().min(0).max(1),
  }),
  hardware: z.object({
    cores: z.number().int().min(1).max(64),
    memoryGb: z.number().min(0.5).max(256),
    maxTouchPoints: z.number().int().min(0).max(10),
  }),
  locales: z.object({
    languages: z.array(z.string()).min(1),
    acceptLanguage: z.string(),
  }),
  timezone: z.string(),
  geolocation: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().positive(),
    })
    .nullable(),
  webrtcPolicy: z.literal('disable_non_proxied_udp'),
  webdriverHidden: z.literal(true),
});

export type FingerprintBundle = z.infer<typeof FingerprintBundle>;
