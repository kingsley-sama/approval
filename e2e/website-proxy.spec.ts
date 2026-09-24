import { test, expect } from '@playwright/test';
import { rewriteHtml, rewriteCss, parseSrcset } from '../lib/website/proxy-html';
import { toProxyPath, fromProxyPath, TOKEN_PARAM } from '../lib/website/proxy-path';
import { pageKey, samePage, matchPage } from '../lib/website/url';
import { fanOut } from '../lib/website/anchor';

/**
 * The website proxy's rewriting and addressing, without a server or a site.
 *
 * Each case is markup a real site shipped that used to come out broken: the
 * image either kept pointing at the origin or pointed at a proxied address
 * that could not exist. They run in milliseconds, so they cover the shapes
 * the live suite (website.spec.ts) can only hit if the site under test
 * happens to use them.
 */

const PID = '00000000-0000-4000-8000-000000000000';
const ctx = { pageUrl: 'https://site.de/de/page/', projectId: PID };
const proxied = (u: string) => toProxyPath(u, PID);

const body = (html: string) => rewriteHtml(html, ctx).html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<script data-revision-shim>[\s\S]*?<\/script>/, '');

test.describe('proxy addressing', () => {
  test('round-trips a page with a trailing slash, a query and a port', () => {
    for (const u of ['https://site.de/', 'https://site.de/a/b/', 'https://site.de/a/b.html?x=1&y=a%20b', 'http://site.de:8080/x']) {
      const path = proxied(u);
      expect(path.startsWith(`/api/websites/p/${PID}/`)).toBe(true);
      expect(fromProxyPath(path)?.target.toString()).toBe(new URL(u).toString());
    }
  });

  test('keeps the trailing slash as a segment, so relative URLs resolve like on the site', () => {
    const path = proxied('https://site.de/about/');
    // `assets/x.webp` on the site means /about/assets/x.webp.
    const resolved = new URL('assets/x.webp', `http://app.test${path}`);
    expect(fromProxyPath(resolved.pathname)?.target.toString()).toBe('https://site.de/about/assets/x.webp');
  });

  test('strips the share token without re-encoding the site query', () => {
    const path = `${proxied('https://site.de/img?url=%2Fa%2Fb.png&w=64')}&${TOKEN_PARAM}=abc`;
    expect(fromProxyPath(path)?.target.search).toBe('?url=%2Fa%2Fb.png&w=64');
  });

  test('rejects addresses that are not ours', () => {
    expect(fromProxyPath('/api/websites/proxy?url=x')).toBeNull();
    expect(fromProxyPath('/projects/abc')).toBeNull();
  });
});

test.describe('html rewriting', () => {
  test('unquoted attributes', () => {
    expect(body('<img src=/img/a.jpg alt=x>')).toContain(`src="${proxied('https://site.de/img/a.jpg')}"`);
    expect(body('<img src=/img.php?w=300&h=2>')).toContain(proxied('https://site.de/img.php?w=300&h=2').replace(/&/g, '&amp;'));
  });

  test('entity-quoted url() in a style attribute', () => {
    const out = body('<div style="background-image:url(&quot;/img/b.jpg&quot;)"></div>');
    expect(out).toContain(proxied('https://site.de/img/b.jpg'));
    expect(out).not.toContain('%22');
  });

  test('single-quoted style attribute', () => {
    expect(body("<div style='background:url(/img/c.jpg)'></div>")).toContain(proxied('https://site.de/img/c.jpg'));
  });

  test('lazy-load attributes', () => {
    const out = body('<img data-srcset="/d-1x.jpg 1x, /d-2x.jpg 2x" data-lazy-src="/e.jpg"><div data-bg="/f.jpg" data-background-image="url(/g.jpg)"></div>');
    for (const f of ['d-1x', 'd-2x', 'e', 'f', 'g']) expect(out).toContain(proxied(`https://site.de/${f}.jpg`));
  });

  test('srcset URLs that contain commas', () => {
    const src = 'https://res.cloudinary.com/x/image/upload/w_300,h_200/a.jpg 300w, https://res.cloudinary.com/x/image/upload/w_600,h_400/a.jpg 600w';
    expect(parseSrcset(src)).toEqual([
      ['https://res.cloudinary.com/x/image/upload/w_300,h_200/a.jpg', '300w'],
      ['https://res.cloudinary.com/x/image/upload/w_600,h_400/a.jpg', '600w'],
    ]);
    expect(body(`<img srcset="${src}">`)).toContain(proxied('https://res.cloudinary.com/x/image/upload/w_300,h_200/a.jpg'));
  });

  test('SVG sprites', () => {
    expect(body('<svg><use xlink:href="/sprite.svg#icon"></use></svg>')).toContain(proxied('https://site.de/sprite.svg#icon'));
  });

  test('leaves fragments, data: URLs and already-proxied addresses alone', () => {
    const already = proxied('https://site.de/x.png');
    const out = body(`<a href="#top"></a><img src="data:image/png;base64,AAAA"><img src="${already}">`);
    expect(out).toContain('href="#top"');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out.split(already).length).toBe(2);
  });

  test('css url() in any quoting, and @import', () => {
    const out = rewriteCss(`a{background:url(/a.png)} b{background:url('/b.png')} @import "/c.css";`, ctx);
    for (const f of ['a.png', 'b.png', 'c.css']) expect(out).toContain(proxied(`https://site.de/${f}`));
  });
});

test.describe('page identity', () => {
  test('ignores www, trailing slash, fragment and tracking parameters', () => {
    expect(samePage('https://www.site.de/about/', 'https://site.de/about')).toBe(true);
    expect(samePage('https://site.de/about#team', 'https://site.de/about')).toBe(true);
    expect(samePage('https://site.de/about?utm_source=mail&gclid=1', 'https://site.de/about')).toBe(true);
    expect(pageKey('https://site.de/?b=2&a=1')).toBe(pageKey('https://site.de?a=1&b=2'));
  });

  test('keeps pages with different paths or real parameters apart', () => {
    expect(samePage('https://site.de/about', 'https://site.de/contact')).toBe(false);
    expect(samePage('https://site.de/list?page=2', 'https://site.de/list')).toBe(false);
  });

  test('matches a frame address to a page of the review', () => {
    const pages = [{ id: 'a', sourceUrl: 'https://site.de/' }, { id: 'b', sourceUrl: 'https://site.de/about' }];
    expect(matchPage('https://www.site.de/about/?utm_medium=x', pages)?.id).toBe('b');
    expect(matchPage('https://site.de/unknown', pages)).toBeUndefined();
  });
});

test.describe('overlapping pins', () => {
  test('fan out far enough apart to click each one', () => {
    const pts = [0, 1, 2, 3].map((i) => ({ id: String(i), x: 500 + i, y: 300 }));
    const off = fanOut(pts);
    const shown = pts.map((p) => ({ x: p.x + (off.get(p.id)?.dx ?? 0), y: p.y + (off.get(p.id)?.dy ?? 0) }));
    for (let i = 0; i < shown.length; i++) {
      for (let j = i + 1; j < shown.length; j++) {
        expect(Math.hypot(shown[i].x - shown[j].x, shown[i].y - shown[j].y)).toBeGreaterThanOrEqual(20);
      }
    }
  });

  test('leave pins that do not collide exactly where they are', () => {
    expect(fanOut([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 200, y: 200 }]).size).toBe(0);
  });
});
