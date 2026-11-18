// Re-emit a small HTML vocabulary. Only script[src] can carry a URL.
// Inline JS needs the renderer's opaque-origin sandbox and restrictive CSP as well.
import { WIDGET_MAX_HTML } from '../shared/coach-ui.ts';
import { invalid } from './coach-schema.ts';

const cdns = new Set(['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'esm.sh']);
const tags = new Set(
  (
    'div span section p b strong i em small sub sup output label input button select option ' +
    'canvas svg g path line rect circle ellipse polygon polyline text br h3 h4 ul ol li table thead tbody tr th td'
  ).split(' '),
);
const attrs = new Set(
  (
    'id class role title for type value min max step width height checked selected disabled ' +
    'tabindex x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width transform text-anchor'
  ).split(' '),
);
const network =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|RTCPeerConnection|Worker|SharedWorker|import)\b/i;
const address = /(?:https?:|wss?:|\/\/[^\s/]+|data:|blob:|javascript:)/i;
const scriptAddress = /(?:https?:|wss?:|["'`]\s*\/\/|data:|blob:|javascript:)/i;
const unsafeCss = /@import|url\s*\(|image(?:-set)?\s*\(|@font-face|[\\&]/i;
const escapeAttr = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function safeSrc(src: string) {
  try {
    const url = new URL(src);
    if (url.protocol === 'https:' && cdns.has(url.hostname) && !url.username && !url.password && !url.port)
      return escapeAttr(url.href);
  } catch {
    /* drop malformed and relative URLs */
  }
}

function attributes(raw: string) {
  const values = new Map<string, string>();
  const attr = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  let pos = 0;
  while (pos < raw.length) {
    attr.lastIndex = pos;
    const m = attr.exec(raw);
    if (!m) {
      if (!raw.slice(pos).trim()) break;
      invalid();
    }
    const name = m[1].toLowerCase();
    if (values.has(name)) invalid();
    values.set(name, m[2] ?? m[3] ?? m[4] ?? '');
    pos = attr.lastIndex;
  }
  return values;
}

export function cleanWidget(html: string) {
  const token = /<!--[\s\S]*?-->|<(\/?)\s*([a-z][a-z0-9:-]*)((?:[^"'<>]|"[^"]*"|'[^']*')*?)(\/?)>|[^<]+/giy;
  const out: string[] = [];
  let pos = 0;
  let hasElement = false,
    hasContent = false;
  while (pos < html.length) {
    token.lastIndex = pos;
    const m = token.exec(html);
    if (!m) invalid();
    pos = token.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    if (!m[2]) {
      out.push(m[0]);
      if (m[0].trim()) hasContent = true;
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      if (tags.has(tag)) out.push('</' + tag + '>');
      continue;
    }
    const values = attributes(m[3]);
    if (tag === 'script' || tag === 'style') {
      const end = new RegExp('</' + tag + '\\s*>', 'ig');
      end.lastIndex = pos;
      const close = end.exec(html);
      if (!close || m[4]) invalid();
      const body = html.slice(pos, close.index);
      pos = end.lastIndex;
      if (tag === 'style') {
        if (!unsafeCss.test(body) && !address.test(body)) out.push('<style>', body, '</style>');
      } else if (values.has('src')) {
        const src = safeSrc(values.get('src')!);
        if (src)
          out.push(
            '<script' + (values.get('type') === 'module' ? ' type="module"' : '') + ' src="' + src + '"></script>',
          );
      } else if (!network.test(body) && !scriptAddress.test(body.replaceAll('http://www.w3.org/2000/svg', ''))) {
        out.push('<script' + (values.get('type') === 'module' ? ' type="module"' : '') + '>', body, '</script>');
      }
      continue;
    }
    if (!tags.has(tag)) continue;
    hasElement = true;
    if (['input', 'button', 'select', 'canvas', 'svg'].includes(tag)) hasContent = true;
    out.push('<' + tag);
    for (const [key, value] of values) {
      if (address.test(value)) continue;
      if (key === 'style' || key === 'fill' || key === 'stroke') {
        if (unsafeCss.test(value)) continue;
      } else if (key !== 'viewbox' && !attrs.has(key) && !/^(?:aria|data)-[a-z][a-z0-9-]*$/.test(key)) continue;
      out.push(' ' + (key === 'viewbox' ? 'viewBox' : key) + '="' + escapeAttr(value) + '"');
    }
    out.push(m[4] ? '/>' : '>');
  }
  const result = out.join('').trim();
  if (!hasElement || (!hasContent && !result.includes('<script')) || result.length > WIDGET_MAX_HTML) invalid();
  return result;
}
