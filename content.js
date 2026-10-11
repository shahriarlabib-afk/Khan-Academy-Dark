/* Khan Academy Dark - content script (colours only) */
(() => {
  'use strict';
  if (window.top !== window || !window.KAD) return;
  const K = window.KAD;
  const DEFAULTS = { enabled: true };

  const QUESTION = [
    '[data-testid*="question" i]', '[data-test-id*="question" i]', '[data-testid*="exercise-item" i]'
  ].join(',');

  const BASE_CSS = `
html { background-color: #12151b !important; }
body { background-color: #12151b !important; color: #e4e8f0; }
${QUESTION} { background-color: #fff !important; color: #21242c !important; }
`;

  const S = {
    base: null, out: null, css: [], sheets: new WeakMap(), fetched: new Set(),
    inline: new WeakMap(), queue: new Set(), raf: 0, scanQueued: false
  };
  const ROOTISH = /(^|[\s,>+~(])(:root|html)(?![\w-])/;

  const CAN_ADOPT = (() => {
    try { return 'adoptedStyleSheets' in document && typeof new CSSStyleSheet().replaceSync === 'function'; }
    catch (e) { return false; }
  })();
  function addStyle(id, text) {
    const el = document.createElement('style');
    el.id = id; el.setAttribute('data-kad', '1');
    if (text) el.textContent = text;
    (document.head || document.documentElement).appendChild(el);
    return el;
  }
  function outSheet() { return CAN_ADOPT ? S.out : S.out.sheet; }
  function ensureStyles() {
    if (CAN_ADOPT) {
      if (!S.base) {
        S.base = new CSSStyleSheet(); S.base.replaceSync(BASE_CSS);
        S.out = new CSSStyleSheet();
        for (const css of S.css) { try { S.out.insertRule(css, S.out.cssRules.length); } catch (e) { /* skip */ } }
      }
      const cur = document.adoptedStyleSheets;
      if (!cur.includes(S.base) || !cur.includes(S.out)) {
        document.adoptedStyleSheets = cur.filter((x) => x !== S.base && x !== S.out).concat([S.base, S.out]);
      }
      return;
    }
    if (!S.base || !S.base.isConnected) S.base = addStyle('kad-base', BASE_CSS);
    if (!S.out || !S.out.isConnected) {
      S.out = addStyle('kad-overrides');
      for (const css of S.css) { try { S.out.sheet.insertRule(css, S.out.sheet.cssRules.length); } catch (e) { /* skip */ } }
    }
  }
  function removeBase() {
    if (CAN_ADOPT) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== S.base && x !== S.out);
    else S.base.remove();
  }
  function flush(list) {
    ensureStyles();
    const sheet = outSheet();
    for (const css of list) {
      try { sheet.insertRule(css, sheet.cssRules.length); S.css.push(css); } catch (e) { /* invalid selector etc. */ }
    }
  }

  function styleRuleCss(rule, base) {
    const decl = K.overrideDeclarations(rule.style.cssText, base, /:(hover|active|focus)/.test(rule.selectorText));
    if (!decl) return '';
    const css = rule.selectorText + '{' + decl + '}';
    if (typeof CSSScopeRule !== 'undefined' && !ROOTISH.test(rule.selectorText)) {
      return '@scope (:root) to (' + QUESTION + ') {' + css + '}';
    }
    return css;
  }
  function ruleToCss(rule, base) {
    try {
      if (typeof CSSPageRule !== 'undefined' && rule instanceof CSSPageRule) return '';
      if (rule.selectorText !== undefined && rule.style) return styleRuleCss(rule, base);
      if (typeof CSSImportRule !== 'undefined' && rule instanceof CSSImportRule) {
        return rule.styleSheet ? Array.from(rule.styleSheet.cssRules).map((r) => ruleToCss(r, rule.styleSheet.href || base)).join('') : '';
      }
      if (typeof CSSKeyframesRule !== 'undefined' && rule instanceof CSSKeyframesRule) return '';
      if (rule.cssRules && rule.cssRules.length) {
        const text = rule.cssText, head = text.slice(0, text.indexOf('{')).trim();
        const inner = Array.from(rule.cssRules).map((r) => ruleToCss(r, base)).join('');
        return inner ? head + '{' + inner + '}' : '';
      }
    } catch (e) { /* ignore a bad rule */ }
    return '';
  }

  function fetchExternal(sheet) {
    const href = sheet.href;
    if (!href || S.fetched.has(href) || !/(khanacademy\.org|kastatic\.org)/.test(href)) return;
    S.fetched.add(href);
    try {
      chrome.runtime.sendMessage({ type: 'kad-fetch-css', url: href }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) return;
        try {
          const cs = new CSSStyleSheet();
          cs.replaceSync(res.text);
          flush(Array.from(cs.cssRules).map((r) => ruleToCss(r, href)).filter(Boolean));
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* extension context gone */ }
  }

  function scan() {
    S.scanQueued = false;
    ensureStyles();
    const out = [];
    for (const sheet of Array.from(document.styleSheets)) {
      const owner = sheet.ownerNode;
      if (owner && owner.getAttribute && owner.getAttribute('data-kad')) continue;
      let rec = S.sheets.get(sheet);
      if (!rec) { rec = { n: 0, ext: false }; S.sheets.set(sheet, rec); }
      if (rec.ext || sheet.disabled || (sheet.media && sheet.media.mediaText === 'print')) continue;
      let rules;
      try { rules = sheet.cssRules; } catch (e) { rec.ext = true; fetchExternal(sheet); continue; }
      if (rules.length < rec.n) rec.n = rules.length;
      for (let i = rec.n; i < rules.length; i++) {
        const css = ruleToCss(rules[i], sheet.href);
        if (css) out.push(css);
      }
      rec.n = rules.length;
    }
    if (out.length) flush(out);
  }
  function scheduleScan() {
    if (S.scanQueued) return;
    S.scanQueued = true;
    requestAnimationFrame(scan);
  }

  function fixInline(el) {
    if (el.nodeType !== 1) return;
    const st = el.style;
    if (!st || !st.length) return;
    const sig = el.getAttribute('style');
    if (S.inline.get(el) === sig) return;
    if (el.closest && el.closest(QUESTION)) { S.inline.set(el, sig); return; }
    const names = [];
    for (let i = 0; i < st.length; i++) names.push(st[i]);
    for (const name of names) {
      if (st.getPropertyPriority(name) === 'important') continue;
      const value = st.getPropertyValue(name);
      if (!value) continue;
      for (const [prop, val, role] of K.plan(name, value)) {
        const mapped = K.mapValue(val, role, null);
        if (mapped !== val) st.setProperty(prop, mapped, 'important');
      }
    }
    S.inline.set(el, el.getAttribute('style'));
  }
  function queueTree(node) {
    if (node.nodeType !== 1) return;
    S.queue.add(node);
    node.querySelectorAll('[style]').forEach((n) => S.queue.add(n));
    if (!S.raf) S.raf = requestAnimationFrame(drain);
  }
  function drain() {
    S.raf = 0;
    const t0 = performance.now();
    for (const el of S.queue) {
      S.queue.delete(el);
      fixInline(el);
      if (performance.now() - t0 > 8) break;
    }
    if (S.queue.size) S.raf = requestAnimationFrame(drain);
  }

  function start() {
    scan();
    setInterval(scan, 300);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') { S.queue.add(m.target); if (!S.raf) S.raf = requestAnimationFrame(drain); }
        else for (const n of m.addedNodes) if (n.nodeType === 1 && !(n.getAttribute && n.getAttribute('data-kad'))) queueTree(n);
      }
      scheduleScan();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    const first = () => { queueTree(document.documentElement); scan(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first, { once: true });
    else first();
    window.addEventListener('load', first, { once: true });
  }

  ensureStyles();
  const boot = (s) => { if (!s.enabled) removeBase(); else start(); };
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(DEFAULTS, boot);
    chrome.storage.onChanged.addListener((ch) => { if (ch.enabled) location.reload(); });
  } else boot(DEFAULTS);
})();
