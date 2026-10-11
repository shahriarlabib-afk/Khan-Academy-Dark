/* Khan Academy Dark - colour engine (pure functions, no DOM access) */
(function (root) {
  'use strict';

  const NAMED = {
    white: [255, 255, 255], black: [0, 0, 0], whitesmoke: [245, 245, 245],
    gainsboro: [220, 220, 220], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
    silver: [192, 192, 192], gray: [128, 128, 128], grey: [128, 128, 128],
    darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105],
    dimgrey: [105, 105, 105], snow: [255, 250, 250], ghostwhite: [248, 248, 255],
    aliceblue: [240, 248, 255], navy: [0, 0, 128]
  };
  const COLOR_SRC =
    '#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![\\w-])' +
    '|(?<![\\w-])(?:rgb|hsl)a?\\([^()]*\\)' +
    '|(?<![\\w-])(?:' + Object.keys(NAMED).join('|') + '|transparent)(?![\\w(-])';
  const colorRe = () => new RegExp(COLOR_SRC, 'gi');
  const GRAD_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/gi;
  const PROTECT_RE = /url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const HUE = 222; // cool blue-grey tint shared by every neutral

  /* ---------- colour maths ---------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  const fromHsl = (h, s, l, a) => { const [r, g, b] = hslToRgb(h, clamp(s), clamp(l)); return { r, g, b, a }; };

  function parseColor(tok) {
    const t = tok.toLowerCase();
    if (t === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (NAMED[t]) return { r: NAMED[t][0], g: NAMED[t][1], b: NAMED[t][2], a: 1 };
    if (t[0] === '#') {
      let h = t.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    const m = t.match(/^(rgb|hsl)a?\(([^)]*)\)$/);
    if (!m) return null;
    const p = m[2].trim().split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const pct = (s, scale) => (s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));
    let a = p[3] !== undefined ? pct(p[3], 1) : 1, r, g, b;
    if (m[1] === 'rgb') { r = pct(p[0], 255); g = pct(p[1], 255); b = pct(p[2], 255); }
    else { [r, g, b] = hslToRgb(parseFloat(p[0]), parseFloat(p[1]) / 100, parseFloat(p[2]) / 100); }
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r: Math.round(clamp(r, 0, 255)), g: Math.round(clamp(g, 0, 255)), b: Math.round(clamp(b, 0, 255)), a: clamp(a) };
  }
  function fmt(c) {
    if (c.a >= 0.999) return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
    return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + (Math.round(c.a * 1000) / 1000) + ')';
  }

  /* ---------- role-based mapping ----------
     bg     surfaces            (light -> deep blue-grey, tints stay tinted)
     fg     text / icons        (dark -> soft white, links & brand colours lifted for contrast)
     border lines / dividers    (light hairlines -> subtle lighter-than-surface lines)
     shadow shadows / ring-shadows
     Each function returns the SAME object when nothing changes. */
  function mapBg(c) {
    if (c.a === 0) return c;
    const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
    const neutral = s < 0.22;
    if (neutral && l < 0.35 && l > 0.05 && c.a <= 0.4) return { r: 255, g: 255, b: 255, a: Math.min(0.12, c.a * 0.9) };
    if (l >= 0.6) {
      if (c.a < 0.5) return c;
      const nl = l >= 0.96 ? 0.12 + (l - 0.96) * 0.6 : 0.14 + (0.96 - l) * 0.8;
      return fromHsl(neutral ? HUE : h, neutral ? 0.14 : Math.min(s, 0.7) * 0.7, nl, c.a);
    }
    if (neutral) return fromHsl(HUE, Math.max(s, 0.12), l, c.a);
    if (l < 0.3 && s >= 0.3) return fromHsl(h, s * 0.8, l * 0.92, c.a);
    return c;
  }
  function mapFg(c) {
    if (c.a === 0) return c;
    const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
    const dark = l < 0.25 || s < 0.3;
    if (dark && l < 0.6) {
      const neutral = s < 0.3;
      return fromHsl(neutral ? HUE : h, neutral ? 0.14 : Math.min(s, 0.45), 0.93 - l * 0.42, c.a);
    }
    if (!dark && l < 0.74) return fromHsl(h, Math.min(s, 0.72), l + (0.74 - l) * 0.65, c.a);
    return c;
  }
  function mapBorder(c) {
    if (c.a === 0) return c;
    const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
    if (s < 0.3) {
      if (l > 0.9 && c.a < 0.6) return c;
      const nl = l >= 0.5 ? 0.12 + (1 - l) * 0.95 : 0.595 + (0.5 - l) * 0.45;
      return fromHsl(HUE, 0.14, nl, c.a);
    }
    if (l >= 0.7) return fromHsl(h, s * 0.6, 0.12 + (1 - l) * 0.95 + 0.04, c.a);
    return mapFg(c);
  }
  function mapShadow(c) {
    if (c.a === 0) return c;
    const [, s, l] = rgbToHsl(c.r, c.g, c.b);
    if (c.a >= 0.9) return s >= 0.3 ? mapFg(c) : mapBorder(c);
    if (l < 0.6) return { r: 0, g: 0, b: 0, a: Math.min(0.7, c.a * 2) };
    return c;
  }
  function mapColor(c, role) {
    switch (role) {
      case 'bg': return mapBg(c);
      case 'bgstate': {
        const m = mapBg(c);
        if (m === c || c.a < 0.5 || rgbToHsl(c.r, c.g, c.b)[2] < 0.6) return m;
        const [h, s2, l] = rgbToHsl(m.r, m.g, m.b);
        return fromHsl(h, s2, l + 0.04, m.a);
      }
      case 'fg': return mapFg(c);
      case 'border': return mapBorder(c);
      case 'shadow': return mapShadow(c);
      default: return c;
    }
  }

  /* ---------- value rewriting ---------- */
  function absUrl(token, base) {
    if (!base || !/^url\(/i.test(token)) return token;
    const inner = token.slice(4, -1).trim().replace(/^['"]|['"]$/g, '');
    if (!inner || /^(data:|https?:|\/\/|#)/i.test(inner)) return token;
    try { return 'url("' + new URL(inner, base).href + '")'; } catch (e) { return token; }
  }
  function mapValue(value, role, base) {
    const saved = [];
    let v = value.replace(PROTECT_RE, (m) => { saved.push(m); return '\u0000' + (saved.length - 1) + '\u0000'; });
    v = v.replace(colorRe(), (tok) => {
      const c = parseColor(tok);
      if (!c) return tok;
      const out = mapColor(c, role);
      return out === c ? tok : fmt(out);
    });
    return v.replace(/\u0000(\d+)\u0000/g, (_, i) => absUrl(saved[+i], base));
  }
  function firstColor(value) {
    const v = value.replace(PROTECT_RE, ' ').replace(GRAD_RE, ' ');
    const m = v.match(colorRe());
    return m ? m[0] : null;
  }

  /* ---------- which declarations carry colour, and in which role ---------- */
  const FG = new Set(['color', 'caret-color', 'text-decoration-color', '-webkit-text-fill-color',
    '-webkit-text-stroke-color', 'text-emphasis-color', 'fill', 'stroke']);
  const SIDES = '(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?';
  const BORDER_LONG = new RegExp('^border' + SIDES + '-color$');
  const BORDER_SHORT = new RegExp('^border' + SIDES + '$');

  function customRole(n) {
    n = n.toLowerCase();
    if (/shadow/.test(n)) return 'shadow';
    if (/(^|-)(bg|background|surface|canvas|backdrop|overlay|fill)(-|$)/.test(n)) return 'bg';
    if (/border|stroke|outline|divider|separator|ring/.test(n)) return 'border';
    if (/text|foreground|(^|-)fg(-|$)|color|icon|font|link|label/.test(n)) return 'fg';
    return null;
  }
  function plan(name, value) {
    if (name.startsWith('--')) { const r = customRole(name); return r ? [[name, value, r]] : []; }
    if (FG.has(name)) return [[name, value, 'fg']];
    if (name === 'background-color' || name === 'background-image') return [[name, value, 'bg']];
    if (name === 'background') {
      const res = [], grads = value.match(GRAD_RE);
      const t = firstColor(value);
      if (t) res.push(['background-color', t, 'bg']);
      if (grads) res.push(['background-image', grads.join(', '), 'bg']);
      return res;
    }
    if (BORDER_LONG.test(name) || name === 'outline-color') return [[name, value, 'border']];
    if (BORDER_SHORT.test(name) || name === 'outline') {
      const t = firstColor(value); return t ? [[name + '-color', t, 'border']] : [];
    }
    if (name === 'text-decoration') { const t = firstColor(value); return t ? [['text-decoration-color', t, 'fg']] : []; }
    if (name === '-webkit-text-stroke') { const t = firstColor(value); return t ? [['-webkit-text-stroke-color', t, 'fg']] : []; }
    if (name === 'box-shadow') return [[name, value, 'shadow']];
    return [];
  }

  function splitDecls(text) {
    const out = []; let depth = 0, q = null, cur = '';
    for (const ch of text) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  const HAS_COLOR = new RegExp(COLOR_SRC, 'i');

  function overrideDeclarations(styleText, base, isState) {
    const out = [];
    for (const d of splitDecls(styleText)) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const raw = d.slice(0, i).trim();
      const name = raw.startsWith('--') ? raw : raw.toLowerCase();
      const value = d.slice(i + 1).trim().replace(/\s*!important\s*$/i, '');
      if (!HAS_COLOR.test(value)) continue;
      for (const [prop, val, role0] of plan(name, value)) {
        const role = isState && role0 === 'bg' && prop === 'background-color' ? 'bgstate' : role0;
        const mapped = mapValue(val, role, base);
        if (mapped !== val) out.push(prop + ':' + mapped + ' !important');
      }
    }
    return out.join(';');
  }

  const api = { parseColor, fmt, mapColor, mapValue, plan, overrideDeclarations, rgbToHsl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KAD = api;
})(typeof self !== 'undefined' ? self : this);
