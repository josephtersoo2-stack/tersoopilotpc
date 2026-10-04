/**
 * Recognising a genuine organic search result.
 *
 * "Click the Nth search result" is only well defined if the page can tell a
 * result apart from everything else that looks like a link. On a Google SERP
 * that means rejecting, at minimum:
 *
 *   - sponsored blocks
 *   - the "People also ask" accordion
 *   - related-searches and pagination links
 *   - the nav tabs (Images, Videos, News, Maps) and the footer
 *
 * The strongest single signal is that **the destination is not the search
 * engine itself**. Nav tabs, "People also ask", related searches and pagination
 * all link back to `google.com/search?...`, while a real result goes somewhere
 * else. Ad markers handle the sponsored block, which points off-site.
 *
 * This module exists because the two code paths that make this decision -
 * `XPathResolver` (non-LLM steps) and `pickPreferredResult` (LLM steps) - had
 * drifted into disagreeing with each other, and both were wrong in different
 * ways. There is one definition now.
 *
 * The predicate is exported as **source text** rather than a function on
 * purpose. It has to run inside the page, and a named function passed to
 * `page.evaluate` is rewritten by esbuild's keepNames (enabled by tsx and
 * vitest) into a call to a `__name` helper that does not exist there, so the
 * callback throws `ReferenceError: __name is not defined` and the code path
 * silently no-ops. As a string it is immune, and it is also testable outside a
 * bundler.
 */

/**
 * Host suffixes owned by search engines.
 *
 * Compared against the registrable-ish tail of a host, so `news.google.com`
 * and `maps.google.com` are both treated as internal.
 */
export const SEARCH_ENGINE_HOSTS = [
  'google.',
  'bing.',
  'duckduckgo.',
  'yahoo.',
  'yandex.',
  'ecosia.',
  'brave.',
  'baidu.',
  'naver.',
  'yep.com',
  'startpage.',
  'aol.',
  'ask.com',
  'qwant.',
  'mojeek.',
  'searx.',
] as const;

/** Markers for sponsored content, which must never be treated as a result. */
export const AD_MARKERS = [
  '[data-text-ad]',
  '[data-ad-client]',
  '[data-ad-slot]',
  '#tads',
  '#bottomads',
  '.ads-ad',
  '.commercial-unit-desktop-top',
  '[aria-label*="sponsored" i]',
  '[aria-label*="advertisement" i]',
  '[aria-label*="Ad ·" i]',
] as const;

/**
 * Containers holding "People also ask", related searches and other in-page
 * widgets.
 *
 * Note what is deliberately *absent*: a generic `[aria-expanded]` ancestor test.
 * Google puts `aria-expanded` on the container of nearly every organic result,
 * so testing for it discarded the real results and left the resolver falling
 * through to raw CSS ordering - which is what made "the Nth result" land on an
 * unrelated link. Accordions are identified by their own containers instead.
 */
export const WIDGET_MARKERS = [
  '.related-question-pair',
  '.kp-wholepage',
  '.kp-blk',
  '.kno-fb-ctx',
  '[jsname="Cpkphb"]',
  '[jsname="yEVEwb"]',
  '[jsname="E4PVZc"]',
  '[data-initq]',
  '[data-q]',
  'g-accordion-expander',
  'details',
  '[role="region"]',
  '[role="tablist"]',
] as const;

/** Page chrome that never contains results. */
export const CHROME_MARKERS = [
  'nav',
  'header',
  'footer',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="search"]',
  '#foot',
  '#fbar',
  '#bres',
  '.nav',
] as const;

/**
 * Page-side source: a self-contained `tersooIsOrganicLink(el)` plus the two
 * helpers it needs.
 *
 * Must stay dependency-free and avoid anything that mutates the page - it runs
 * on every evaluation, on a live profile, and a visible side effect would give
 * the page a reason to notice it.
 */
export const ORGANIC_LINK_PREDICATE_SRC = `
  function tersooHost(urlStr) {
    try {
      var parsed = new URL(urlStr, location.href);
      return parsed.hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function tersooDestUrl(rawHref) {
    if (!rawHref) return '';
    var urlStr = rawHref;
    // Google wraps outbound links as /url?q=<target>
    if (urlStr.indexOf('/url?') === 0 || urlStr.indexOf('google.com/url?') !== -1) {
      try {
        var wrapper = new URL(urlStr, location.href);
        var inner = wrapper.searchParams.get('q') || wrapper.searchParams.get('url');
        if (inner) urlStr = inner;
      } catch (e) {
        /* keep the original */
      }
    }
    return urlStr;
  }

  function tersooIsEngineHost(host) {
    if (!host) return true;
    for (var i = 0; i < TERSOO_ENGINE_HOSTS.length; i++) {
      if (host.indexOf(TERSOO_ENGINE_HOSTS[i]) !== -1) return true;
    }
    // Same registrable host as the page we are on, e.g. localhost or a
    // self-hosted engine. On a real SERP the page host IS the engine.
    return host === location.hostname.toLowerCase();
  }

  function tersooIsOrganicLink(el) {
    if (!el || el.tagName !== 'A') return false;
    if (el.closest(TERSOO_AD_MARKERS.join(','))) return false;
    if (el.closest(TERSOO_WIDGET_MARKERS.join(','))) return false;
    if (el.closest(TERSOO_CHROME_MARKERS.join(','))) return false;

    var rawHref = el.getAttribute('href') || '';
    if (!rawHref) return false;
    if (rawHref.charAt(0) === '#') return false;
    if (rawHref.slice(0, 11).toLowerCase() === 'javascript:') return false;

    var dest = tersooDestUrl(rawHref);
    if (!dest) return false;
    if (tersooIsEngineHost(tersooHost(dest))) return false;

    return true;
  }
`;

/** Node-side equivalent, for callers that only have a URL. */
export function isEngineInternalUrl(rawHref: string, pageHost: string): boolean {
  if (!rawHref) return true;
  if (rawHref.startsWith('#')) return true;
  if (/^javascript:/i.test(rawHref)) return true;

  let dest = rawHref;
  if (dest.startsWith('/url?') || dest.includes('google.com/url?')) {
    try {
      const wrapper = new URL(dest, `https://${pageHost || 'example.invalid'}`);
      const inner = wrapper.searchParams.get('q') ?? wrapper.searchParams.get('url');
      if (inner) dest = inner;
    } catch {
      // Keep the original and let the host check decide.
    }
  }

  let host = '';
  try {
    host = new URL(dest, `https://${pageHost || 'example.invalid'}`).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (!host) return true;
  if (SEARCH_ENGINE_HOSTS.some((h) => host.includes(h))) return true;
  return host === pageHost.toLowerCase();
}

/**
 * Builds the page-side script that lists the organic results in document order.
 *
 * The same list backs both "click result N" and "which result should this run
 * prefer", so an index means the same thing everywhere.
 */
export function buildOrganicListScript(): string {
  return `(() => {
${buildPredicatePrelude()}
  var out = [];
  var anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    if (!tersooIsOrganicLink(a)) continue;
    if (a.getClientRects && a.getClientRects().length === 0) continue;
    var heading = a.querySelector('h2, h3, h4') || a.closest('h1, h2, h3, h4');
    out.push({
      index: out.length,
      href: a.getAttribute('href') || '',
      text: ((a.innerText || a.textContent) || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      hasHeading: Boolean(heading)
    });
  }
  return out;
})()`;
}

/**
 * Builds the page-side script that tags exactly one organic result so it can be
 * addressed with a selector.
 *
 * Results are ordered headline-first and de-duplicated by destination host, so
 * `targetIndex` is stable for a given page: `0`, `1` and `2` always mean the
 * first, second and third distinct site rather than whatever a raw CSS
 * selector happens to order them into.
 */
export function buildPickOrganicScript(
  targetIndex: number,
  resolvedAttr: string,
  resolvedVal: string,
): string {
  return `(() => {
${buildPredicatePrelude()}
  var TARGET_INDEX = ${Math.max(0, Math.trunc(targetIndex))};
  var RESOLVED_ATTR = ${JSON.stringify(resolvedAttr)};
  var RESOLVED_VAL = ${JSON.stringify(resolvedVal)};

  function tersooIsVisible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    var style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  var seenHosts = {};
  var organic = [];

  function tersooConsider(a) {
    if (!a || !tersooIsVisible(a)) return;
    if (!tersooIsOrganicLink(a)) return;
    var host = tersooHost(tersooDestUrl(a.getAttribute('href') || ''));
    if (!host || seenHosts[host]) return;
    seenHosts[host] = true;
    organic.push(a);
  }

  var anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'));
  var i;
  // Headline-bearing anchors first: a genuine result leads with an h2/h3.
  for (i = 0; i < anchors.length; i++) {
    var el = anchors[i];
    if (!el.querySelector('h2, h3, h4') && !el.closest('h1, h2, h3, h4')) continue;
    tersooConsider(el);
  }
  // Then anything else organic, so pages that do not use headings still resolve.
  for (i = 0; i < anchors.length; i++) {
    var el2 = anchors[i];
    if (el2.querySelector('h2, h3, h4') || el2.closest('h1, h2, h3, h4')) continue;
    tersooConsider(el2);
  }

  var picked = organic[TARGET_INDEX];
  if (!picked) return false;

  // Force same-tab navigation so the run keeps control of the page.
  try {
    picked.removeAttribute('target');
    picked.setAttribute('target', '_self');
  } catch (e) {}
  picked.setAttribute(RESOLVED_ATTR, RESOLVED_VAL);
  return true;
})()`;
}

/** The shared predicate plus its marker lists, ready to inline in a script. */
export function buildPredicatePrelude(): string {
  return `  var TERSOO_ENGINE_HOSTS = ${JSON.stringify([...SEARCH_ENGINE_HOSTS])};
  var TERSOO_AD_MARKERS = ${JSON.stringify([...AD_MARKERS])};
  var TERSOO_WIDGET_MARKERS = ${JSON.stringify([...WIDGET_MARKERS])};
  var TERSOO_CHROME_MARKERS = ${JSON.stringify([...CHROME_MARKERS])};
${ORGANIC_LINK_PREDICATE_SRC}`;
}
