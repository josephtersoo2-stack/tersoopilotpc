import { DEFAULT_PRESET_IDS, type Platform } from '@tersoo/contracts';

export interface ScreenOption {
  width: number;
  height: number;
  availWidth?: number;
  availHeight?: number;
  colorDepth?: number;
  dpr: number;
}

export interface WebglOption {
  vendor: string;
  renderer: string;
  unmaskedVendor: string;
  unmaskedRenderer: string;
}

export interface HardwareOptions {
  coreOptions: number[];
  memoryOptionsGb: number[];
  maxTouchPoints: number;
}

export interface PresetDefinition {
  id: string;
  name: string;
  platform: Platform;
  description: string;
  baseUserAgent: string;
  uaMetadata: {
    brands: Array<{ brand: string; version: string }>;
    platform: string;
    platformVersion: string;
    architecture: string;
    model: string;
    mobile: boolean;
  };
  screenOptions: ScreenOption[];
  webglOptions: WebglOption[];
  hardwareOptions: HardwareOptions;
  locales: {
    languages: string[];
    acceptLanguage: string;
  };
  defaultTimezone: string;
}

const COMMON_CHROME_BRANDS = [
  { brand: 'Chromium', version: '128' },
  { brand: 'Not;A=Brand', version: '24' },
  { brand: 'Google Chrome', version: '128' },
];

export const PRESET_DEFINITIONS: Record<string, PresetDefinition> = {
  [DEFAULT_PRESET_IDS.windows11]: {
    id: DEFAULT_PRESET_IDS.windows11,
    name: 'Windows 11 Stealth (24H2)',
    platform: 'windows',
    description: 'High-end Windows 11 workstation with modern NVIDIA GeForce GPU',
    baseUserAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    uaMetadata: {
      brands: COMMON_CHROME_BRANDS,
      platform: 'Windows',
      platformVersion: '15.0.0',
      architecture: 'x86',
      model: '',
      mobile: false,
    },
    screenOptions: [
      { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, dpr: 1, colorDepth: 24 },
      { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, dpr: 1, colorDepth: 24 },
      { width: 3840, height: 2160, availWidth: 3840, availHeight: 2120, dpr: 1.5, colorDepth: 24 },
    ],
    webglOptions: [
      {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'NVIDIA GeForce RTX 4090',
      },
      {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'NVIDIA GeForce RTX 4080',
      },
      {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
      },
      {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'NVIDIA GeForce RTX 3080',
      },
    ],
    hardwareOptions: {
      coreOptions: [8, 12, 16, 24, 32],
      memoryOptionsGb: [16, 32, 64],
      maxTouchPoints: 0,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    defaultTimezone: 'America/New_York',
  },

  [DEFAULT_PRESET_IDS.windows10]: {
    id: DEFAULT_PRESET_IDS.windows10,
    name: 'Windows 10 Workstation (22H2)',
    platform: 'windows',
    description: 'Enterprise Windows 10 client with AMD Radeon or NVIDIA GPU',
    baseUserAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    uaMetadata: {
      brands: COMMON_CHROME_BRANDS,
      platform: 'Windows',
      platformVersion: '10.0.0',
      architecture: 'x86',
      model: '',
      mobile: false,
    },
    screenOptions: [
      { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, dpr: 1, colorDepth: 24 },
      { width: 1680, height: 1050, availWidth: 1680, availHeight: 1010, dpr: 1, colorDepth: 24 },
      { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, dpr: 1.25, colorDepth: 24 },
    ],
    webglOptions: [
      {
        vendor: 'Google Inc. (AMD)',
        renderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'AMD',
        unmaskedRenderer: 'AMD Radeon RX 7900 XTX',
      },
      {
        vendor: 'Google Inc. (AMD)',
        renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'AMD',
        unmaskedRenderer: 'AMD Radeon RX 6800 XT',
      },
      {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'NVIDIA GeForce RTX 3070',
      },
    ],
    hardwareOptions: {
      coreOptions: [6, 8, 12, 16],
      memoryOptionsGb: [16, 32],
      maxTouchPoints: 0,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    defaultTimezone: 'America/Chicago',
  },

  [DEFAULT_PRESET_IDS.macosSonoma]: {
    id: DEFAULT_PRESET_IDS.macosSonoma,
    name: 'macOS Sonoma (Apple M2 Pro)',
    platform: 'macos',
    description: 'Modern Apple Silicon MacBook with Metal GPU',
    baseUserAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    uaMetadata: {
      brands: COMMON_CHROME_BRANDS,
      platform: 'Macintosh',
      platformVersion: '14.5.0',
      architecture: 'arm',
      model: '',
      mobile: false,
    },
    screenOptions: [
      { width: 1440, height: 900, availWidth: 1440, availHeight: 875, dpr: 2, colorDepth: 24 },
      { width: 1728, height: 1117, availWidth: 1728, availHeight: 1092, dpr: 2, colorDepth: 24 },
      { width: 1512, height: 982, availWidth: 1512, availHeight: 957, dpr: 2, colorDepth: 24 },
    ],
    webglOptions: [
      {
        vendor: 'Apple Inc.',
        renderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
        unmaskedVendor: 'Apple',
        unmaskedRenderer: 'Apple M2 Pro',
      },
      {
        vendor: 'Apple Inc.',
        renderer: 'ANGLE (Apple, Apple M2 Max, OpenGL 4.1)',
        unmaskedVendor: 'Apple',
        unmaskedRenderer: 'Apple M2 Max',
      },
    ],
    hardwareOptions: {
      coreOptions: [10, 12],
      memoryOptionsGb: [16, 24, 32],
      maxTouchPoints: 0,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    defaultTimezone: 'America/Los_Angeles',
  },

  [DEFAULT_PRESET_IDS.macosSequoia]: {
    id: DEFAULT_PRESET_IDS.macosSequoia,
    name: 'macOS Sequoia (Apple M3 Max)',
    platform: 'macos',
    description: 'High-performance Apple Silicon MacBook Pro M3',
    baseUserAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    uaMetadata: {
      brands: COMMON_CHROME_BRANDS,
      platform: 'Macintosh',
      platformVersion: '15.0.0',
      architecture: 'arm',
      model: '',
      mobile: false,
    },
    screenOptions: [
      { width: 1728, height: 1117, availWidth: 1728, availHeight: 1092, dpr: 2, colorDepth: 24 },
      { width: 2560, height: 1440, availWidth: 2560, availHeight: 1415, dpr: 2, colorDepth: 24 },
    ],
    webglOptions: [
      {
        vendor: 'Apple Inc.',
        renderer: 'ANGLE (Apple, Apple M3 Max, OpenGL 4.1)',
        unmaskedVendor: 'Apple',
        unmaskedRenderer: 'Apple M3 Max',
      },
      {
        vendor: 'Apple Inc.',
        renderer: 'ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
        unmaskedVendor: 'Apple',
        unmaskedRenderer: 'Apple M3 Pro',
      },
    ],
    hardwareOptions: {
      coreOptions: [12, 14, 16],
      memoryOptionsGb: [36, 48, 64],
      maxTouchPoints: 0,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    defaultTimezone: 'America/Los_Angeles',
  },

  [DEFAULT_PRESET_IDS.android14]: {
    id: DEFAULT_PRESET_IDS.android14,
    name: 'Android 14 (Google Pixel 8 Pro)',
    platform: 'android',
    description: 'Flagship Google Pixel device with Google Tensor G3 and Adreno/Mali GPU',
    baseUserAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    uaMetadata: {
      brands: COMMON_CHROME_BRANDS,
      platform: 'Android',
      platformVersion: '14.0.0',
      architecture: 'arm64',
      model: 'Pixel 8 Pro',
      mobile: true,
    },
    screenOptions: [
      { width: 412, height: 915, availWidth: 412, availHeight: 915, dpr: 2.625, colorDepth: 24 },
      { width: 393, height: 851, availWidth: 393, availHeight: 851, dpr: 2.75, colorDepth: 24 },
    ],
    webglOptions: [
      {
        vendor: 'Qualcomm',
        renderer: 'Qualcomm / Adreno (TM) 750',
        unmaskedVendor: 'Qualcomm',
        unmaskedRenderer: 'Adreno (TM) 750',
      },
      {
        vendor: 'ARM',
        renderer: 'ARM / Mali-G715 MC11',
        unmaskedVendor: 'ARM',
        unmaskedRenderer: 'Mali-G715 MC11',
      },
    ],
    hardwareOptions: {
      coreOptions: [8],
      memoryOptionsGb: [8, 12],
      maxTouchPoints: 5,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    defaultTimezone: 'America/New_York',
  },

  [DEFAULT_PRESET_IDS.galaxyS24]: {
    id: DEFAULT_PRESET_IDS.galaxyS24,
    name: 'Android 14 (Samsung Galaxy S24 Ultra)',
    platform: 'android',
    description: 'Samsung flagship mobile phone with Snapdragon 8 Gen 3',
    baseUserAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    uaMetadata: {
      brands: COMMON_CHROME_BRANDS,
      platform: 'Android',
      platformVersion: '14.0.0',
      architecture: 'arm64',
      model: 'SM-S928B',
      mobile: true,
    },
    screenOptions: [
      { width: 390, height: 844, availWidth: 390, availHeight: 844, dpr: 3, colorDepth: 24 },
      { width: 412, height: 915, availWidth: 412, availHeight: 915, dpr: 3.125, colorDepth: 24 },
    ],
    webglOptions: [
      {
        vendor: 'Qualcomm',
        renderer: 'Qualcomm / Adreno (TM) 750',
        unmaskedVendor: 'Qualcomm',
        unmaskedRenderer: 'Adreno (TM) 750',
      },
    ],
    hardwareOptions: {
      coreOptions: [8],
      memoryOptionsGb: [12, 16],
      maxTouchPoints: 5,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    defaultTimezone: 'America/Chicago',
  },
};
