import { describe, expect, it } from 'vitest';
import {
  applyProfileToCamouConfig,
  buildCamoufoxOptions,
  formatCleanWebgl,
  mapPlatform,
} from '../src/engines/camoufox/buildOptions';
import { EngineFactory } from '../src/engines/EngineFactory';
import { CamoufoxEngine } from '../src/engines/camoufox/CamoufoxEngine';
import { ApostateEngine } from '../src/engines/apostate/ApostateEngine';

describe('Phase 4 - CamoufoxEngine Integration', () => {
  it('registers both apostate and camoufox engines in EngineFactory by default', () => {
    const factory = new EngineFactory();
    expect(factory.hasEngine('apostate')).toBe(true);
    expect(factory.hasEngine('camoufox')).toBe(true);

    const apostate = factory.getEngine('apostate');
    expect(apostate).toBeInstanceOf(ApostateEngine);
    expect(apostate.type).toBe('apostate');

    const camoufox = factory.getEngine('camoufox');
    expect(camoufox).toBeInstanceOf(CamoufoxEngine);
    expect(camoufox.type).toBe('camoufox');
  });

  it('correctly maps platforms to Camoufox OS targets', () => {
    expect(mapPlatform('windows')).toBe('windows');
    expect(mapPlatform('macos')).toBe('macos');
    expect(mapPlatform('android')).toBe('linux');
    expect(mapPlatform('linux')).toBe('linux');
  });

  it('builds coherent Camoufox launch options', () => {
    const options = buildCamoufoxOptions({
      userDataDir: 'C:\\Users\\Akende Micheal\\AppData\\Local\\tersoo\\profiles\\p-camoufox',
      proxyPort: 10800,
      seed: 42,
      platform: 'windows',
      languages: ['en-US', 'en'],
      timezone: 'America/New_York',
      headless: true,
      screen: { width: 1920, height: 1080 },
    });

    expect(options.headless).toBe(true);
    expect(options.os).toBe('windows');
    expect(options.locale).toBe('en-US');
    expect(options.geoip).toBe(true);
    expect(options.proxy).toEqual({ server: 'socks5://127.0.0.1:10800' });
    expect(options.seed).toBe(42);
    expect(options.window).toEqual([1920, 1080]);
    expect(options.firefox_user_prefs['intl.accept_languages']).toBe('en-US,en');
    expect(options.firefox_user_prefs['keyword.enabled']).toBe(true);
  });

  it('clamps window dimensions to host screen work area when hostScreen is provided', () => {
    const options = buildCamoufoxOptions({
      userDataDir: '/tmp/profiles/p-highres',
      proxyPort: 0,
      seed: 101,
      platform: 'windows',
      languages: ['en-US'],
      timezone: 'America/Chicago',
      headless: false,
      screen: { width: 2560, height: 1440 },
      hostScreen: { width: 1920, height: 1080, workAreaWidth: 1920, workAreaHeight: 1040 },
    });

    // Window should clamp to host workArea - 20 (1900 x 1020)
    expect(options.window).toEqual([1900, 1020]);
    expect(options.args).toContain('-width');
    expect(options.args).toContain('1900');
    expect(options.args).toContain('-height');
    expect(options.args).toContain('1020');
  });

  it('omits proxy configuration when forwarderPort is 0', () => {
    const options = buildCamoufoxOptions({
      userDataDir: '/tmp/profiles/p-direct',
      proxyPort: 0,
      seed: 99,
      platform: 'macos',
      languages: ['en-GB'],
      timezone: 'Europe/London',
      headless: false,
    });

    expect(options.geoip).toBe(true);
    expect(options.proxy).toBeUndefined();
    expect(options.os).toBe('macos');
  });

  it('formats clean, authentic WebGL strings without leak suffixes', () => {
    const rtx = formatCleanWebgl('windows', 'NVIDIA GeForce RTX 4080 Direct3D11', 'NVIDIA Corporation');
    expect(rtx.vendor).toBe('Google Inc. (NVIDIA)');
    expect(rtx.renderer).toBe('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)');

    const stripped = formatCleanWebgl('windows', 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar', 'Google Inc. (Intel)');
    expect(stripped.vendor).toBe('Google Inc. (Intel)');
    expect(stripped.renderer).toBe('ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0)');
    expect(stripped.renderer).not.toContain(', or similar');
  });

  it('accurately injects profile GPU, screen, and hardware into CAMOU_CONFIG without locking window dimensions', () => {
    const initialConfig = {
      'screen.width': 6400,
      'screen.height': 1800,
      'window.innerWidth': 6400,
      'window.outerWidth': 6400,
      'webGl:renderer': 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',
      'webGl:vendor': 'Google Inc. (Intel)',
      'webGl:parameters': {
        '37446': 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',
        '37445': 'Google Inc. (Intel)',
        '7937': 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',
      },
      'webGl2:parameters': {
        '37446': 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',
        '37445': 'Google Inc. (Intel)',
        '7937': 'ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar',
      },
      'navigator.hardwareConcurrency': 4,
    };

    const configStr = JSON.stringify(initialConfig);
    const mockOpts: Record<string, any> = {
      env: {
        CAMOU_CONFIG_1: configStr,
      },
    };

    applyProfileToCamouConfig(mockOpts, {
      userDataDir: '/tmp/test',
      proxyPort: 0,
      seed: 12345,
      platform: 'windows',
      languages: ['en-US'],
      timezone: 'America/New_York',
      headless: true,
      screen: {
        width: 2560,
        height: 1440,
        availWidth: 2560,
        availHeight: 1400,
        dpr: 1.0,
      },
      webgl: {
        unmaskedRenderer: 'NVIDIA GeForce RTX 4080 Direct3D11',
        unmaskedVendor: 'NVIDIA Corporation',
      },
      hardware: {
        cores: 12,
        maxTouchPoints: 0,
      },
    });

    const chunks = Object.keys(mockOpts.env)
      .filter((k) => k.startsWith('CAMOU_CONFIG_'))
      .sort(
        (a, b) =>
          parseInt(a.replace('CAMOU_CONFIG_', ''), 10) -
          parseInt(b.replace('CAMOU_CONFIG_', ''), 10),
      )
      .map((k) => mockOpts.env[k]);
    const updatedConfig = JSON.parse(chunks.join(''));

    expect(updatedConfig['webGl:renderer']).toBe(
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)',
    );
    expect(updatedConfig['webGl:renderer']).not.toContain(', or similar');
    expect(updatedConfig['webGl:vendor']).toBe('Google Inc. (NVIDIA)');
    expect(updatedConfig['webGl:parameters']['37446']).toBe(
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)',
    );
    expect(updatedConfig['webGl:parameters']['37445']).toBe('Google Inc. (NVIDIA)');
    expect(updatedConfig['webGl2:parameters']['37446']).toBe(
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)',
    );
    expect(updatedConfig['screen.width']).toBe(2560);
    expect(updatedConfig['screen.height']).toBe(1440);
    expect(updatedConfig['screen.availWidth']).toBe(2560);
    expect(updatedConfig['screen.availHeight']).toBe(1400);

    // Assert that rigid window dimensions are deleted to allow dynamic viewport reflow
    expect(updatedConfig['window.outerWidth']).toBeUndefined();
    expect(updatedConfig['window.innerWidth']).toBeUndefined();
    expect(updatedConfig['window.outerHeight']).toBeUndefined();
    expect(updatedConfig['window.innerHeight']).toBeUndefined();

    expect(updatedConfig['navigator.hardwareConcurrency']).toBe(12);
    expect(updatedConfig['navigator.maxTouchPoints']).toBe(0);
    expect(updatedConfig['canvas:seed']).toBeGreaterThan(0);
    expect(updatedConfig['audio:seed']).toBeGreaterThan(0);
  });
});
