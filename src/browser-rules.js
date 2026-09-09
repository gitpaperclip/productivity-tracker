'use strict';

// Shared by the classifier and renderer; no Electron or filesystem access.
(function (root) {
  const browserNames = Object.freeze([
    'chrome', 'google chrome', 'msedge', 'edge', 'microsoft edge',
    'firefox', 'mozilla firefox', 'brave', 'brave browser', 'opera', 'opera browser',
    'chromium', 'vivaldi', 'waterfox', 'librewolf', 'floorp', 'zen', 'palemoon',
    'pale moon', 'mullvadbrowser', 'mullvad browser', 'tor browser', 'arc', 'safari',
    'duckduckgo', 'browser'
  ]);
  function normalizeAppName(value) {
    return String(value || '').split(/[/\\]/).pop().trim().toLowerCase().replace(/\.exe$/, '');
  }
  function isBrowserName(value, extraNames) {
    const name = normalizeAppName(value);
    return !!name && (browserNames.includes(name) || /(?:^|[\s-])browser$/.test(name) ||
      (Array.isArray(extraNames) && extraNames.some((item) => normalizeAppName(item) === name)));
  }
  function hostname(value) {
    if (typeof value !== 'string' || !value.trim() || /\s/.test(value)) return '';
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      return host.includes('.') && /^[a-z0-9.-]+$/.test(host) ? host : '';
    } catch (_) { return ''; }
  }

  function siteDomain(tag) {
    if (typeof tag !== 'string' || !/^site:/i.test(tag.trim())) return '';
    const value = tag.trim().slice(5).toLowerCase();
    // Rules are domains, never paths, search terms, credentials, or wildcards.
    if (!/^[a-z0-9.-]+$/.test(value)) return '';
    const host = hostname(value);
    return host && host.split('.').every((part) => part && !part.startsWith('-') && !part.endsWith('-')) ? host : '';
  }

  function classifySite(url, rules) {
    const host = hostname(url);
    if (!host) return null;
    let best = '', category = null;
    // More specific subdomains win; equal specificity favors unproductive.
    for (const type of ['productive', 'unproductive']) {
      for (const tag of (rules && rules[type]) || []) {
        const domain = siteDomain(tag);
        if (domain && (host === domain || host.endsWith(`.${domain}`)) && domain.length >= best.length) {
          best = domain;
          category = type;
        }
      }
    }
    return category;
  }

  function classifyBrowser(entry, rules) {
    const site = classifySite(entry.url, rules);
    if (site) return site;
    const text = `${entry.title || ''} ${entry.url || ''}`.toLowerCase();
    for (const type of ['unproductive', 'productive']) {
      if (((rules && rules[type]) || []).some((tag) => {
        const key = String(tag || '').trim().toLowerCase();
        return key && !key.startsWith('site:') && text.includes(key);
      })) return type;
    }
    return 'productive';
  }

  function validateSiteTags(rules) {
    for (const type of ['productive', 'unproductive']) {
      for (const tag of (rules && rules[type]) || []) {
        if (typeof tag === 'string' && /^site:/i.test(tag.trim()) && !siteDomain(tag)) {
          throw new Error(`Invalid website tag: ${tag}. Use site:example.com.`);
        }
      }
    }
  }

  const api = { hostname, siteDomain, classifySite, classifyBrowser, validateSiteTags, browserNames, isBrowserName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.sydtrackBrowserRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
