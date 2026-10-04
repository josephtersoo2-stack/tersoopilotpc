import { buildAuthenticatedProxyUrl, type ForwarderCredentials } from '../../proxy/proxyUrl';
import { sanitizeAdditionalArgs } from '../shared/argSanitizer';
import { resolveCamoufoxBinary } from './resolveBinary';

export interface BuildCamoufoxOptionsInput {
  userDataDir: string;
  proxyPort: number;
  /** Credentials the local forwarder requires from its client. */
  proxyCredentials?: ForwarderCredentials | null | undefined;
  seed: number;
  platform: string;
  languages: string[];
  timezone: string;
  headless: boolean;
  executablePath?: string | undefined;
  additionalArgs?: string[] | undefined;
  screen?: {
    width: number;
    height: number;
    availWidth?: number;
    availHeight?: number;
    colorDepth?: number;
    dpr?: number | undefined;
  } | undefined;
  webgl?: {
    vendor?: string;
    renderer?: string;
    unmaskedVendor?: string;
    unmaskedRenderer?: string;
  } | undefined;
  hardware?: {
    cores?: number;
    memoryGb?: number;
    maxTouchPoints?: number;
  } | undefined;
  hostScreen?: {
    width: number;
    height: number;
    workAreaWidth?: number;
    workAreaHeight?: number;
  } | undefined;
}

export function mapPlatform(p: string): 'windows' | 'macos' | 'linux' {
  if (p === 'windows') return 'windows';
  if (p === 'macos') return 'macos';
  return 'linux';
}

export function buildCamoufoxOptions(input: BuildCamoufoxOptionsInput): Record<string, any> {
  const binary = input.executablePath || resolveCamoufoxBinary();
  const options: Record<string, any> = {
    headless: input.headless,
    user_data_dir: input.userDataDir,
    executable_path: binary,
    geoip: true,
    os: mapPlatform(input.platform),
    locale: input.languages[0] || 'en-US',
    humanize: true,
    seed: input.seed,
    firefox_user_prefs: {
      'intl.accept_languages': input.languages.join(','),
      'media.peerconnection.ice.proxy_only': input.proxyPort > 0,
      'media.peerconnection.ice.default_address_only': true,
      'media.peerconnection.ice.no_host': true,
      'media.peerconnection.ice.obfuscate_host_addresses': true,
      'network.proxy.socks_remote_dns': true,
      'keyword.enabled': true,
      'browser.search.suggest.enabled': true,
      'browser.urlbar.suggest.searches': true,
      'browser.startup.page': 1,
      'browser.startup.homepage': 'about:home',
      'browser.newtabpage.enabled': true,
      'browser.newtabpage.activity-stream.showSearch': true,
      'browser.newtabpage.activity-stream.feeds.topsites': true,
      'browser.newtabpage.activity-stream.default.sites':
        'https://en.wikipedia.org/,https://www.youtube.com/,https://www.reddit.com/,https://addons.mozilla.org/',
      'browser.toolbars.bookmarks.visibility': 'always',
      'browser.urlbar.placeholderName': 'Google',
      'browser.search.defaultenginename': 'Google',
      'extensions.activeThemeID': 'default-theme@mozilla.org',
      'browser.theme.content-theme': 2,
      'browser.theme.toolbar-theme': 2,
      'ui.systemUsesDarkTheme': 0,
    },
  };

  if (input.proxyPort > 0) {
    const server = buildAuthenticatedProxyUrl(input.proxyPort, input.proxyCredentials);
    options.proxy = {
      server,
      ...(input.proxyCredentials
        ? {
            username: input.proxyCredentials.username,
            password: input.proxyCredentials.password,
          }
        : {}),
    };
  }

  const args = sanitizeAdditionalArgs(input.additionalArgs);

  if (input.screen) {
    const maxWinW = input.hostScreen
      ? Math.max(800, (input.hostScreen.workAreaWidth ?? input.hostScreen.width) - 20)
      : input.screen.width;
    const maxWinH = input.hostScreen
      ? Math.max(600, (input.hostScreen.workAreaHeight ?? input.hostScreen.height) - 20)
      : input.screen.height;
    const winW = Math.min(input.screen.width, maxWinW);
    const winH = Math.min(input.screen.height, maxWinH);
    options.window = [winW, winH];
    args.push('-width', String(winW), '-height', String(winH));
  }

  if (args.length > 0) {
    options.args = args;
  }

  return options;
}

export function formatCleanWebgl(
  platform: string,
  rawRenderer?: string,
  rawVendor?: string,
): { renderer: string; vendor: string } {
  let cleanRenderer = (rawRenderer || '').replace(/,\s*or similar/gi, '').trim();
  let cleanVendor = (rawVendor || '').trim();

  const combined = (cleanRenderer + ' ' + cleanVendor).toLowerCase();
  let brand = 'NVIDIA';
  if (combined.includes('amd') || combined.includes('radeon')) {
    brand = 'AMD';
  } else if (combined.includes('intel') || combined.includes('iris') || combined.includes('hd graphics')) {
    brand = 'Intel';
  } else if (combined.includes('apple')) {
    brand = 'Apple';
  }

  const isWindows = platform === 'windows';

  if (isWindows) {
    cleanVendor = 'Google Inc. (' + brand + ')';

    if (cleanRenderer.startsWith('ANGLE (')) {
      cleanRenderer = cleanRenderer.replace(/,\s*or similar/gi, '').trim();
    } else {
      const model = cleanRenderer
        .replace(/\s*Direct3D11.*/i, '')
        .replace(/\s*vs_\d+_\d+.*/i, '')
        .trim();
      cleanRenderer = 'ANGLE (' + brand + ', ' + (model || brand) + ' Direct3D11 vs_5_0 ps_5_0)';
    }
  } else {
    if (!cleanVendor) {
      cleanVendor = brand === 'Apple' ? 'Apple' : 'Google Inc. (' + brand + ')';
    }
    if (!cleanRenderer) {
      cleanRenderer = brand === 'Apple' ? 'Apple M2' : brand + ' Graphics';
    }
  }

  return { renderer: cleanRenderer, vendor: cleanVendor };
}

export function applyProfileToCamouConfig(
  opts: Record<string, any>,
  input: BuildCamoufoxOptionsInput,
): void {
  if (!opts || !opts.env) return;

  const chunks = Object.keys(opts.env)
    .filter((k) => k.startsWith('CAMOU_CONFIG_'))
    .sort(
      (a, b) =>
        parseInt(a.replace('CAMOU_CONFIG_', ''), 10) -
        parseInt(b.replace('CAMOU_CONFIG_', ''), 10),
    )
    .map((k) => opts.env[k]);

  if (chunks.length === 0) return;

  let config: Record<string, any>;
  try {
    config = JSON.parse(chunks.join(''));
  } catch {
    return;
  }

  const rawRenderer = input.webgl?.unmaskedRenderer || input.webgl?.renderer;
  const rawVendor = input.webgl?.unmaskedVendor || input.webgl?.vendor;

  if (rawRenderer || rawVendor) {
    const { renderer, vendor } = formatCleanWebgl(
      mapPlatform(input.platform),
      rawRenderer,
      rawVendor,
    );

    config['webGl:renderer'] = renderer;
    config['webGl:vendor'] = vendor;

    if (config['webGl:parameters']) {
      config['webGl:parameters']['37446'] = renderer;
      config['webGl:parameters']['37445'] = vendor;
      config['webGl:parameters']['7937'] = renderer;
    }
    if (config['webGl2:parameters']) {
      config['webGl2:parameters']['37446'] = renderer;
      config['webGl2:parameters']['37445'] = vendor;
      config['webGl2:parameters']['7937'] = renderer;
    }
  }

  if (input.screen) {
    const { width, height, availWidth, availHeight, dpr, colorDepth } = input.screen;
    if (width) {
      config['screen.width'] = width;
    }
    if (height) {
      config['screen.height'] = height;
    }
    config['screen.availWidth'] = availWidth || width;
    config['screen.availHeight'] = availHeight || (height ? height - 40 : height);
    if (colorDepth) {
      config['screen.colorDepth'] = colorDepth;
      config['screen.pixelDepth'] = colorDepth;
    }
    if (dpr) config['window.devicePixelRatio'] = dpr;
  }

  // Prevent freezing the window dimensions in Camoufox C++ hooks so that
  // the page viewport reflows dynamically when maximized or resized
  delete config['window.outerWidth'];
  delete config['window.innerWidth'];
  delete config['window.outerHeight'];
  delete config['window.innerHeight'];
  delete config['document.body.clientWidth'];
  delete config['document.body.clientHeight'];

  if (input.hardware?.cores) {
    config['navigator.hardwareConcurrency'] = input.hardware.cores;
  }
  if (input.hardware?.maxTouchPoints !== undefined) {
    config['navigator.maxTouchPoints'] = input.hardware.maxTouchPoints;
  }

  if (input.seed) {
    const seedNum = Math.abs(input.seed) || 123456789;
    config['canvas:seed'] = (seedNum % 4294967295) || 1;
    config['audio:seed'] = ((seedNum * 1664525 + 1013904223) >>> 0) || 2;
  }

  for (const k of Object.keys(opts.env)) {
    if (k.startsWith('CAMOU_CONFIG_')) delete opts.env[k];
  }

  const chunkSize = process.platform === 'win32' ? 2047 : 32767;
  const configStr = JSON.stringify(config);
  for (let i = 0; i < configStr.length; i += chunkSize) {
    const chunk = configStr.slice(i, i + chunkSize);
    opts.env['CAMOU_CONFIG_' + (Math.floor(i / chunkSize) + 1)] = chunk;
  }
}
