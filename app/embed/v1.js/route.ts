import { NextResponse } from 'next/server';

/**
 * The embed script.
 *
 * A client drops one tag on the site being reviewed:
 *
 *   <script src="https://revision.exposeprofi.de/embed/v1.js"
 *           data-key="<share token>" defer></script>
 *
 * and comments happen on the real page — no proxy, no iframe, no URL
 * rewriting. Everything the proxy fights with (webfont CORS, framework
 * routers, logins, third-party widgets) simply is not a problem here, because
 * nothing is being copied.
 *
 * Two deliberate constraints:
 *
 *   - All UI lives in a shadow root. The host page's CSS cannot reach in and
 *     break our widget, and our CSS cannot leak out and alter the page being
 *     reviewed — which would be a particularly bad way to collect design
 *     feedback.
 *   - Pins anchor to an element and an offset inside it, not to a percentage
 *     of the page. Content added above a pin then moves it with the element it
 *     was pointing at, instead of leaving it stranded.
 *
 * Served from a route rather than /public so it carries its own cache policy
 * and stays versioned by path.
 */

export const runtime = 'nodejs';

const SCRIPT = String.raw`
(function () {
  'use strict';
  if (window.__revisionEmbedLoaded) return;
  window.__revisionEmbedLoaded = true;

  var tag = document.currentScript;
  if (!tag) {
    var all = document.querySelectorAll('script[data-key]');
    tag = all[all.length - 1];
  }
  if (!tag) return;

  var KEY = tag.getAttribute('data-key');
  if (!KEY) { console.warn('[revision] missing data-key on the embed script'); return; }

  var API;
  try { API = new URL(tag.src, location.href).origin; } catch (e) { return; }

  var ACCENT = '#ff6137';
  var RESOLVED = '#649256';
  var INK = '#0c3133';
  var NAME_STORE = 'revision_embed_name';

  var state = { mode: 'off', comments: [], canComment: false, name: '', pending: null, open: null };
  try { state.name = localStorage.getItem(NAME_STORE) || ''; } catch (e) {}

  function pageUrl() { return location.origin + location.pathname + location.search; }

  // ── selector for the clicked element ────────────────────────────────────
  // Prefer an id, then a stable-looking data attribute, then a positional
  // path. Classes are skipped on purpose: utility and hashed CSS-module class
  // names change on every build, which is exactly when an anchor must not.
  function cssPath(el) {
    if (!(el instanceof Element)) return '';
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + el.id;

    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && node !== document.documentElement && depth < 8) {
      var seg = node.tagName.toLowerCase();
      var testId = node.getAttribute('data-testid') || node.getAttribute('data-test') || node.getAttribute('data-id');
      if (testId) {
        seg += '[data-testid="' + CSS.escape(testId) + '"]';
        parts.unshift(seg);
        break;
      }
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        parts.unshift('#' + node.id);
        break;
      }
      var parent = node.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(seg);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function findAnchor(anchor) {
    if (!anchor || !anchor.selector) return null;
    try { return document.querySelector(anchor.selector); } catch (e) { return null; }
  }

  // ── shadow-root UI ──────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.setAttribute('data-revision-embed', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
  var root = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    ':host,*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.layer{position:fixed;inset:0;pointer-events:none}',
    '.pin{position:fixed;width:28px;height:28px;border-radius:9999px;background:' + ACCENT + ';',
    'border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);color:#fff;font-size:12px;font-weight:700;',
    'display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;',
    'transform:translate(-50%,-50%);transition:transform .12s}',
    '.pin:hover{transform:translate(-50%,-50%) scale(1.12)}',
    '.pin.resolved{background:' + RESOLVED + '}',
    '.fab{position:fixed;right:20px;bottom:20px;height:44px;padding:0 18px;border-radius:9999px;border:0;',
    'background:' + INK + ';color:#fff;font-size:14px;font-weight:600;cursor:pointer;pointer-events:auto;',
    'box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px}',
    '.fab.active{background:' + ACCENT + '}',
    '.fab:disabled{opacity:.6;cursor:default}',
    '.card{position:fixed;width:290px;background:#fff;border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.24);',
    'padding:12px;pointer-events:auto;border:1px solid rgba(0,0,0,.08)}',
    '.card h4{margin:0 0 8px;font-size:12px;color:#666;font-weight:600;letter-spacing:.02em}',
    '.card input,.card textarea{width:100%;border:1px solid #dcdcdc;border-radius:8px;padding:8px;',
    'font-size:13px;margin-bottom:8px;resize:vertical;color:' + INK + ';background:#fff}',
    '.card textarea{min-height:76px}',
    '.card .row{display:flex;gap:8px;justify-content:flex-end}',
    '.card button{border:0;border-radius:8px;padding:7px 13px;font-size:13px;cursor:pointer;font-weight:600}',
    '.card .save{background:' + ACCENT + ';color:#fff}',
    '.card .cancel{background:#eee;color:#333}',
    '.card .err{color:#c44344;font-size:12px;margin:0 0 8px}',
    '.read{font-size:13px;color:' + INK + ';white-space:pre-wrap;margin:0 0 8px;max-height:180px;overflow:auto}',
    '.meta{font-size:11px;color:#777;margin:0 0 8px}',
    '.hint{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:' + INK + ';color:#fff;',
    'font-size:12px;padding:7px 14px;border-radius:9999px;pointer-events:none;box-shadow:0 3px 10px rgba(0,0,0,.25)}'
  ].join('');
  root.appendChild(style);

  var layer = document.createElement('div');
  layer.className = 'layer';
  root.appendChild(layer);

  var fab = document.createElement('button');
  fab.className = 'fab';
  fab.textContent = 'Feedback';
  root.appendChild(fab);

  function mount() {
    (document.body || document.documentElement).appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // ── rendering ───────────────────────────────────────────────────────────
  var pinEls = [];
  function clearTransient() {
    Array.prototype.forEach.call(root.querySelectorAll('.card,.hint'), function (n) { n.remove(); });
  }

  function positionOf(c) {
    var el = findAnchor(c.anchor);
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) {
        var ax = c.anchor && typeof c.anchor.xPct === 'number' ? c.anchor.xPct : 50;
        var ay = c.anchor && typeof c.anchor.yPct === 'number' ? c.anchor.yPct : 50;
        return { x: r.left + (r.width * ax) / 100, y: r.top + (r.height * ay) / 100, anchored: true };
      }
    }
    // The element is gone — fall back to the document percentage so the pin is
    // still roughly where it was rather than disappearing.
    var docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    return {
      x: (c.x / 100) * docW - window.scrollX,
      y: (c.y / 100) * docH - window.scrollY,
      anchored: false
    };
  }

  function renderPins() {
    pinEls.forEach(function (n) { n.remove(); });
    pinEls = [];
    state.comments.forEach(function (c) {
      var p = positionOf(c);
      if (p.y < -60 || p.y > innerHeight + 60) return;
      var el = document.createElement('div');
      el.className = 'pin' + (c.resolved ? ' resolved' : '');
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.textContent = c.number;
      el.title = c.author + ': ' + c.content;
      if (!p.anchored) el.style.opacity = '.65';
      el.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        showComment(c, p);
      });
      layer.appendChild(el);
      pinEls.push(el);
    });
  }

  var ticking = false;
  function scheduleRender() {
    if (ticking) return;
    ticking = true;
    var done = function () { ticking = false; renderPins(); };
    // rAF paces redraws smoothly while the page is visible, but browsers pause
    // it entirely in a background tab — and a reviewer often has the site open
    // in one. Without the timeout, the ticking flag would stay true and pins
    // would freeze until the tab was focused again.
    var raf = 0;
    try { raf = requestAnimationFrame(done); } catch (e) {}
    setTimeout(function () {
      if (!ticking) return;
      try { if (raf) cancelAnimationFrame(raf); } catch (e) {}
      done();
    }, 100);
  }
  addEventListener('scroll', scheduleRender, true);
  addEventListener('resize', scheduleRender);

  // Scroll and resize are not enough. A pin is positioned from its element's
  // bounding rect, so anything that moves that element must trigger a redraw —
  // and content being inserted above it fires neither event. Without this the
  // pin sits still while the thing it points at slides away, which is the exact
  // drift the element anchor exists to prevent.
  try {
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(scheduleRender);
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }
  } catch (e) {}

  try {
    if (window.MutationObserver) {
      var moTimer = null;
      var mo = new MutationObserver(function () {
        // Debounced: a busy page mutates constantly, and a pin redraw is
        // cheap but not free.
        if (moTimer) clearTimeout(moTimer);
        moTimer = setTimeout(scheduleRender, 150);
      });
      var startMo = function () {
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      };
      if (document.body) startMo();
      else document.addEventListener('DOMContentLoaded', startMo);
    }
  } catch (e) {}

  // ── reading a comment ───────────────────────────────────────────────────
  function showComment(c, pos) {
    clearTransient();
    var card = document.createElement('div');
    card.className = 'card';
    card.style.left = Math.min(Math.max(12, pos.x + 20), innerWidth - 302) + 'px';
    card.style.top = Math.min(Math.max(12, pos.y), innerHeight - 190) + 'px';

    var meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = '#' + c.number + ' · ' + c.author + (c.resolved ? ' · resolved' : '');
    var body = document.createElement('p');
    body.className = 'read';
    body.textContent = c.content;
    var row = document.createElement('div');
    row.className = 'row';
    var close = document.createElement('button');
    close.className = 'cancel';
    close.textContent = 'Close';
    close.addEventListener('click', clearTransient);
    row.appendChild(close);

    card.appendChild(meta); card.appendChild(body); card.appendChild(row);
    root.appendChild(card);
  }

  // ── leaving a comment ───────────────────────────────────────────────────
  function openComposer(clientX, clientY, anchor, docPct) {
    clearTransient();
    var card = document.createElement('div');
    card.className = 'card';
    card.style.left = Math.min(Math.max(12, clientX + 14), innerWidth - 302) + 'px';
    card.style.top = Math.min(Math.max(12, clientY + 14), innerHeight - 240) + 'px';

    var title = document.createElement('h4');
    title.textContent = anchor.elementText
      ? 'Comment on "' + anchor.elementText.slice(0, 46) + '"'
      : 'Leave a comment';

    var err = document.createElement('p');
    err.className = 'err';
    err.style.display = 'none';

    var nameInput = document.createElement('input');
    nameInput.placeholder = 'Your name';
    nameInput.value = state.name;

    var text = document.createElement('textarea');
    text.placeholder = 'What should change here?';

    var row = document.createElement('div');
    row.className = 'row';
    var cancel = document.createElement('button');
    cancel.className = 'cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { clearTransient(); setMode('off'); });
    var save = document.createElement('button');
    save.className = 'save';
    save.textContent = 'Send';

    save.addEventListener('click', function () {
      var who = nameInput.value.trim();
      var what = text.value.trim();
      if (!who) { err.textContent = 'Add your name so the team knows who to reply to.'; err.style.display = 'block'; return; }
      if (!what) { err.textContent = 'Write what should change.'; err.style.display = 'block'; return; }
      save.disabled = true; save.textContent = 'Sending…';
      state.name = who;
      try { localStorage.setItem(NAME_STORE, who); } catch (e) {}

      fetch(API + '/api/embed/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: KEY, url: pageUrl(), content: what, userName: who,
          xPosition: docPct.x, yPosition: docPct.y, anchor: anchor
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.success) {
            err.textContent = res.error || 'That did not save.';
            err.style.display = 'block';
            save.disabled = false; save.textContent = 'Send';
            return;
          }
          state.comments.push(res.comment);
          clearTransient();
          setMode('off');
          renderPins();
        })
        .catch(function () {
          err.textContent = 'Could not reach the feedback server.';
          err.style.display = 'block';
          save.disabled = false; save.textContent = 'Send';
        });
    });

    row.appendChild(cancel); row.appendChild(save);
    card.appendChild(title); card.appendChild(err);
    card.appendChild(nameInput); card.appendChild(text); card.appendChild(row);
    root.appendChild(card);
    setTimeout(function () { (state.name ? text : nameInput).focus(); }, 30);
  }

  // ── comment mode ────────────────────────────────────────────────────────
  function onPick(e) {
    // Ignore clicks on our own UI.
    if (e.composedPath && e.composedPath().indexOf(host) !== -1) return;
    e.preventDefault();
    e.stopPropagation();

    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === document.documentElement) el = document.body;

    var rect = el.getBoundingClientRect();
    var anchor = {
      selector: cssPath(el),
      xPct: rect.width ? ((e.clientX - rect.left) / rect.width) * 100 : 50,
      yPct: rect.height ? ((e.clientY - rect.top) / rect.height) * 100 : 50,
      elementText: (el.textContent || '').trim().slice(0, 120),
      viewportWidth: innerWidth
    };

    var docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    var docPct = {
      x: docW ? ((e.clientX + scrollX) / docW) * 100 : 50,
      y: docH ? ((e.clientY + scrollY) / docH) * 100 : 50
    };

    openComposer(e.clientX, e.clientY, anchor, docPct);
  }

  function setMode(mode) {
    state.mode = mode;
    if (mode === 'comment') {
      document.addEventListener('click', onPick, true);
      document.documentElement.style.cursor = 'crosshair';
      fab.classList.add('active');
      fab.textContent = 'Click the page';
      var hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Click anything on the page to comment on it — Esc to stop';
      root.appendChild(hint);
    } else {
      document.removeEventListener('click', onPick, true);
      document.documentElement.style.cursor = '';
      fab.classList.remove('active');
      fab.textContent = 'Feedback';
      clearTransient();
    }
  }

  fab.addEventListener('click', function () {
    if (!state.canComment) return;
    setMode(state.mode === 'comment' ? 'off' : 'comment');
  });

  addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.mode === 'comment') setMode('off');
  });

  // ── load ────────────────────────────────────────────────────────────────
  fetch(API + '/api/embed/comments?key=' + encodeURIComponent(KEY) + '&url=' + encodeURIComponent(pageUrl()))
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res.success) {
        fab.disabled = true;
        fab.textContent = 'Feedback unavailable';
        console.warn('[revision]', res.error);
        return;
      }
      state.comments = res.comments || [];
      state.canComment = !!res.canComment;
      if (!state.canComment) fab.textContent = 'Feedback (read only)';
      renderPins();
    })
    .catch(function () {
      fab.disabled = true;
      fab.textContent = 'Feedback unavailable';
    });
})();
`;

export async function GET() {
  return new NextResponse(SCRIPT, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Short enough that a fix reaches live sites the same day, long enough
      // that it is not refetched on every page view.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
