import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

/**
 * Ensures that the Camoufox installation has:
 * 1. Working search engines (Google + DuckDuckGo) patched in omni.ja so that
 *    it never defaults to the dummy "None" engine (http://127.0.0.1/) and never shows neterror.
 * 2. Neutralized chrome.css so that the browser displays standard Firefox Proton UI
 *    with extensions button, tracking protection shield, normal tab height, and bookmarks bar.
 * 3. Clean distribution/policies.json allowing search engines, bookmarks toolbar, and removing localhost filters.
 * 4. Updated camoufox.cfg enabling the new tab page and top shortcuts.
 *
 * This process is self-healing and upgrade-proof: every time Camoufox launches
 * or updates to a new version, this function runs before the process starts.
 */

export function patchOmniJa(omniPath: string): boolean {
  if (!fs.existsSync(omniPath)) return false;

  try {
    const zip = new AdmZip(omniPath);
    const targetFile = 'moz-src/toolkit/components/search/SearchEngineSelector.sys.mjs';
    const entry = zip.getEntry(targetFile);
    if (!entry) return false;

    const jsContent = entry.getData().toString('utf8');
    if (!jsContent.includes('"identifier": "none"')) {
      // Already patched with real engines
      return false;
    }

    // Backup original omni.ja if not yet created
    const bakPath = omniPath + '.original.bak';
    if (!fs.existsSync(bakPath)) {
      try {
        fs.copyFileSync(omniPath, bakPath);
      } catch (err) {
        console.warn('[Camoufox Provisioner] Could not backup omni.ja:', err);
      }
    }

    let idx = jsContent.indexOf('return [\n        {\n          "recordType": "engine"');
    if (idx === -1) idx = jsContent.indexOf('return [');
    const endIdx = jsContent.indexOf('];', idx);
    if (idx === -1 || endIdx === -1) return false;

    const replacement = `return [
        {
          "recordType": "engine",
          "identifier": "google",
          "base": {
            "name": "Google",
            "classification": "general",
            "urls": {
              "search": {
                "base": "https://www.google.com/search",
                "method": "GET",
                "searchTermParamName": "q"
              },
              "suggestions": {
                "base": "https://suggestqueries.google.com/complete/search?client=firefox",
                "method": "GET",
                "searchTermParamName": "q"
              }
            }
          },
          "variants": [{ "environment": { "allRegionsAndLocales": true } }]
        },
        {
          "recordType": "engine",
          "identifier": "duckduckgo",
          "base": {
            "name": "DuckDuckGo",
            "classification": "general",
            "urls": {
              "search": {
                "base": "https://duckduckgo.com/",
                "method": "GET",
                "searchTermParamName": "q"
              }
            }
          },
          "variants": [{ "environment": { "allRegionsAndLocales": true } }]
        },
        {
          "recordType": "defaultEngines",
          "globalDefault": "google",
          "specificDefaults": []
        },
        {
          "recordType": "engineOrders",
          "orders": []
        }
      ];`;

    const patchedJs = jsContent.slice(0, idx) + replacement + jsContent.slice(endIdx + 2);
    zip.updateFile(targetFile, Buffer.from(patchedJs, 'utf8'));
    zip.writeZip(omniPath);
    console.log(`[Camoufox Provisioner] Successfully patched search engines in ${omniPath}`);
    return true;
  } catch (err) {
    console.error(`[Camoufox Provisioner] Failed to patch ${omniPath}:`, err);
    return false;
  }
}

export function neutralizeChromeCss(cssPath: string): boolean {
  if (!fs.existsSync(cssPath)) return false;

  try {
    const content = fs.readFileSync(cssPath, 'utf8');
    if (
      content.includes('#unified-extensions-button') ||
      content.includes('#PersonalToolbar') ||
      content.includes('--tab-min-height: 25px') ||
      content.includes('Minimalistic theme') ||
      content.includes('#tracking-protection-icon-container')
    ) {
      const bakPath = cssPath + '.bak';
      if (!fs.existsSync(bakPath)) {
        try {
          fs.writeFileSync(bakPath, content, 'utf8');
        } catch {
          // ignore backup write failure
        }
      }
      fs.writeFileSync(
        cssPath,
        '/* Native Firefox Proton UI preserved by TersooPilot */\n',
        'utf8',
      );
      console.log(`[Camoufox Provisioner] Neutralized minimalist theme in ${cssPath}`);
      return true;
    }
  } catch (err) {
    console.warn(`[Camoufox Provisioner] Could not neutralize ${cssPath}:`, err);
  }
  return false;
}

export function cleanPoliciesJson(policyPath: string): boolean {
  if (!fs.existsSync(policyPath)) return false;

  try {
    const raw = fs.readFileSync(policyPath, 'utf8');
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // handle potential UTF-8 BOM
      parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    }

    const policies = parsed?.policies;
    if (!policies) return false;

    let changed = false;

    // Remove localhost network blocks that cause neterror
    if (policies.WebsiteFilter) {
      delete policies.WebsiteFilter;
      changed = true;
    }

    // Allow Bookmarks Toolbar to be visible
    if (policies.DisplayBookmarksToolbar === 'never') {
      policies.DisplayBookmarksToolbar = 'always';
      changed = true;
    }

    if (policies.NoDefaultBookmarks === true) {
      delete policies.NoDefaultBookmarks;
      changed = true;
    }

    // Ensure Google search is configured
    if (!policies.SearchEngines) policies.SearchEngines = {};
    if (policies.SearchEngines.Default === 'None' || !policies.SearchEngines.Default) {
      policies.SearchEngines.Default = 'Google';
      changed = true;
    }
    policies.SearchEngines.PreventInstalls = false;
    policies.SearchEngines.Remove = ['Amazon.com', 'eBay', 'Twitter', 'None'];
    policies.SearchEngines.Add = [
      {
        Name: 'Google',
        URLTemplate: 'https://www.google.com/search?q={searchTerms}',
        Method: 'GET',
        IconURL: 'https://www.google.com/favicon.ico',
        Alias: '@google',
        Description: 'Google Search',
        SuggestURLTemplate:
          'https://suggestqueries.google.com/complete/search?client=firefox&q={searchTerms}',
      },
      {
        Name: 'DuckDuckGo',
        URLTemplate: 'https://duckduckgo.com/?q={searchTerms}',
        Method: 'GET',
        IconURL: 'https://duckduckgo.com/favicon.ico',
        Alias: '@ddg',
        Description: 'DuckDuckGo',
      },
    ];
    changed = true;

    // Ensure google search extension is not uninstalled
    if (Array.isArray(policies.Extensions?.Uninstall)) {
      const idx = policies.Extensions.Uninstall.indexOf('google@search.mozilla.org');
      if (idx !== -1) {
        policies.Extensions.Uninstall.splice(idx, 1);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(policyPath, JSON.stringify(parsed, null, 2), 'utf8');
      console.log(`[Camoufox Provisioner] Cleaned policies in ${policyPath}`);
      return true;
    }
  } catch (err) {
    console.warn(`[Camoufox Provisioner] Failed to clean policies in ${policyPath}:`, err);
  }
  return false;
}

export function updateCamoufoxCfg(cfgPath: string): boolean {
  if (!fs.existsSync(cfgPath)) return false;

  try {
    let content = fs.readFileSync(cfgPath, 'utf8');
    let changed = false;

    if (content.includes('defaultPref("browser.newtabpage.enabled", false);')) {
      content = content.replace(
        'defaultPref("browser.newtabpage.enabled", false);',
        'defaultPref("browser.newtabpage.enabled", true);',
      );
      changed = true;
    }
    if (content.includes('defaultPref("browser.startup.page", 0);')) {
      content = content.replace(
        'defaultPref("browser.startup.page", 0);',
        'defaultPref("browser.startup.page", 1);',
      );
      changed = true;
    }
    if (content.includes('defaultPref("browser.startup.homepage", "about:blank");')) {
      content = content.replace(
        'defaultPref("browser.startup.homepage", "about:blank");',
        'defaultPref("browser.startup.homepage", "about:home");',
      );
      changed = true;
    }
    if (content.includes('defaultPref("browser.newtabpage.activity-stream.feeds.topsites", false);')) {
      content = content.replace(
        'defaultPref("browser.newtabpage.activity-stream.feeds.topsites", false);',
        'defaultPref("browser.newtabpage.activity-stream.feeds.topsites", true);',
      );
      changed = true;
    }
    if (content.includes('defaultPref("browser.newtabpage.activity-stream.default.sites", "");')) {
      content = content.replace(
        'defaultPref("browser.newtabpage.activity-stream.default.sites", "");',
        'defaultPref("browser.newtabpage.activity-stream.default.sites", "https://en.wikipedia.org/,https://www.youtube.com/,https://www.reddit.com/,https://addons.mozilla.org/");',
      );
      changed = true;
    }
    if (content.includes('defaultPref("ui.systemUsesDarkTheme", 1);')) {
      content = content.replace(
        'defaultPref("ui.systemUsesDarkTheme", 1);',
        'defaultPref("ui.systemUsesDarkTheme", 0);',
      );
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(cfgPath, content, 'utf8');
      console.log(`[Camoufox Provisioner] Updated settings in ${cfgPath}`);
      return true;
    }
  } catch (err) {
    console.warn(`[Camoufox Provisioner] Failed to update ${cfgPath}:`, err);
  }
  return false;
}

export function ensureCamoufoxDistribution(executablePath?: string): void {
  const candidateDirs: string[] = [];

  if (executablePath) {
    candidateDirs.push(path.dirname(executablePath));
  }

  if (process.env.CAMOUFOX_INSTALL_DIR) {
    candidateDirs.push(process.env.CAMOUFOX_INSTALL_DIR);
  }

  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || 'C:\\Users\\Akende Micheal', 'AppData', 'Local');

  const officialRoot = path.join(
    localAppData,
    'camoufox',
    'camoufox',
    'Cache',
    'browsers',
    'official',
  );

  if (fs.existsSync(officialRoot)) {
    try {
      const versions = fs.readdirSync(officialRoot);
      for (const ver of versions) {
        candidateDirs.push(path.join(officialRoot, ver));
      }
    } catch {
      // ignore
    }
  }

  // Also include the parent Cache directory
  candidateDirs.push(path.join(localAppData, 'camoufox', 'camoufox', 'Cache'));

  const seen = new Set<string>();
  for (const dir of candidateDirs) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
    seen.add(resolved);

    // 1. omni.ja patch
    const omniPath = path.join(resolved, 'omni.ja');
    if (fs.existsSync(omniPath)) {
      patchOmniJa(omniPath);
    }

    // 2. chrome.css neutralization
    const chromeCssPath = path.join(resolved, 'chrome.css');
    if (fs.existsSync(chromeCssPath)) {
      neutralizeChromeCss(chromeCssPath);
    }

    // 3. distribution/policies.json
    const policyPath = path.join(resolved, 'distribution', 'policies.json');
    if (fs.existsSync(policyPath)) {
      cleanPoliciesJson(policyPath);
    }

    // 4. camoufox.cfg
    const cfgPath = path.join(resolved, 'camoufox.cfg');
    if (fs.existsSync(cfgPath)) {
      updateCamoufoxCfg(cfgPath);
    }
  }
}

export function configureCamoufoxProfile(profileUserDataDir: string): void {
  if (!fs.existsSync(profileUserDataDir)) {
    fs.mkdirSync(profileUserDataDir, { recursive: true });
  }

  // Purge any stale search cache that might contain dummy "None" engine
  const searchMozLz4 = path.join(profileUserDataDir, 'search.json.mozlz4');
  if (fs.existsSync(searchMozLz4)) {
    try {
      const buf = fs.readFileSync(searchMozLz4);
      if (buf.includes(Buffer.from('127.0.0.1')) || buf.includes(Buffer.from('"name":"None"'))) {
        fs.unlinkSync(searchMozLz4);
      }
    } catch {
      // ignore
    }
  }

  // Write default Firefox Home, search, toolbar, and privacy preferences
  const userJsPath = path.join(profileUserDataDir, 'user.js');
  const userPrefs = [
    '// TersooPilot Standard Firefox Proton UI & Search Configuration',
    'user_pref("browser.startup.page", 1);',
    'user_pref("browser.startup.homepage", "about:home");',
    'user_pref("browser.newtabpage.enabled", true);',
    'user_pref("browser.newtabpage.activity-stream.showSearch", true);',
    'user_pref("browser.newtabpage.activity-stream.feeds.topsites", true);',
    'user_pref("browser.newtabpage.activity-stream.default.sites", "https://en.wikipedia.org/,https://www.youtube.com/,https://www.reddit.com/,https://addons.mozilla.org/");',
    'user_pref("browser.newtabpage.activity-stream.topSitesRows", 1);',
    'user_pref("browser.toolbars.bookmarks.visibility", "always");',
    'user_pref("browser.urlbar.placeholderName", "Google");',
    'user_pref("browser.search.defaultenginename", "Google");',
    'user_pref("browser.search.suggest.enabled", true);',
    'user_pref("browser.urlbar.suggest.searches", true);',
    'user_pref("keyword.enabled", true);',
    'user_pref("extensions.activeThemeID", "default-theme@mozilla.org");',
    'user_pref("browser.theme.content-theme", 2);',
    'user_pref("browser.theme.toolbar-theme", 2);',
    'user_pref("ui.systemUsesDarkTheme", 0);',
    'user_pref("media.peerconnection.ice.default_address_only", true);',
    'user_pref("media.peerconnection.ice.no_host", true);',
    'user_pref("media.peerconnection.ice.obfuscate_host_addresses", true);',
    'user_pref("network.proxy.socks_remote_dns", true);',
  ].join('\n');

  try {
    fs.writeFileSync(userJsPath, userPrefs + '\n', 'utf8');
  } catch (err) {
    console.warn('[Camoufox Provisioner] Failed to write profile user.js:', err);
  }
}
