# Website annotation: image loading, pin positioning, page switching

Status: **implemented** (2026-09-23). All five phases are in, using the
recommended answers to the open questions: faded pins with a device badge,
fan-out for overlap, no service worker, phases in order. See
**Implementation notes** at the end for what changed against this plan.
Scope: the live (proxy) website viewer used by the project workspace and the share view.
Snapshot mode (`WEBSITE_VIEWER_MODE=snapshot`) is out of scope unless noted.

---

## 1. Audit findings

Evidence comes from reading the code and from a headless run of the proxy's
rewriter against the one live review site (`bad-säckingen.wallbach-duett.de`).

### 1A. Images failing to load

| # | Finding | Evidence | Impact |
|---|---|---|---|
| A1 | **Relative URLs in runtime-built HTML resolve against `/api/websites/`.** The page is served from `/api/websites/proxy?…`, so `assets/images/x.webp` inserted via `innerHTML` requests `/api/websites/assets/images/x.webp` → 404. The shim only patches the `img.src` setter, not HTML parsed by `innerHTML`/`insertAdjacentHTML`/`setAttribute`. | wallbach-duett: **25 of 41 images broken**, all from `app.js` templates (`<img src="${site.images.logo}">`). | Any JS-rendered site (SPA, Webflow interactions, sliders, lazy loaders) loses most images. **This is the main bug.** |
| A2 | Unquoted attributes are not rewritten: `<img src=/img/a.jpg>`. | Offline rewriter test. | Minified HTML loses images. |
| A3 | Entity-quoted `url()` breaks: `style="background-image:url(&quot;/b.jpg&quot;)"` becomes `…/page/%22/img/b.jpg%22`. | Offline rewriter test. | WordPress/Elementor background images break. |
| A4 | Single-quoted `style='…url(…)'` is not rewritten. | Offline rewriter test. | Background images break. |
| A5 | Lazy-load attributes are not rewritten: `data-srcset`, `data-lazy-src`, `data-lazy-srcset`, `data-bg`, `data-background-image`. | Offline rewriter test. | Lazy loaders copy these into `src` later, so the images 404. |
| A6 | `srcset` is split on every comma, which breaks URLs that contain commas (Cloudinary `w_300,h_200`). | Offline rewriter test. | Responsive CDN images break. |
| A7 | `xlink:href` (SVG sprites) is not rewritten. | Offline rewriter test. | Icon sprites go missing. |
| A8 | **Every asset request hits the database for auth:** a share-token lookup or session + `website_project_access` query + project query. | `app/api/websites/proxy/route.ts:55-95` | Pages with 100+ assets are slow and some requests time out. |
| A9 | Assets are served `Cache-Control: no-store`, so every page switch downloads every image again. | `route.ts:172` | Page switches are slow and images pop in late. |
| A10 | Assets are buffered whole (15 MB cap), `Range` isn't forwarded, and no `Referer` is sent. | `route.ts:137-201` | Videos can't seek, large media returns 413, and hotlink-protected CDNs return 403. |

### 1B. Pin positioning

| # | Finding | Evidence | Impact |
|---|---|---|---|
| P1 | **Pins are stored as a percentage of total document height.** Document height changes while the page loads (lazy images, fonts, consent banners), differs by screen width, and differs by device preset. | `LivePin` x/y are % of `scrollHeight` (`live-viewer.tsx:42`). | A pin at 50% sits at 450px on a 900px page but 6,370px on the settled 12,740px page, so **pins drift and jump while the page loads.** |
| P2 | **The overlay makes the document taller.** The overlay is `position:absolute; height:<doc height>` on `<html>`, and its own height feeds `scrollHeight`. The measured height can grow but never shrink. | `live-viewer.tsx:141-148`, `264-273`. | After content collapses (accordions, closed banners) every pin is off by the stale height. |
| P3 | "Desktop" means the width of the frame, which depends on the reviewer's window size and sidebars. X positions are % of that width. | `DEVICES` width 0 = 100%. | The same pin lands differently for two reviewers with different screens. |
| P4 | Pins placed on desktop are drawn on the tablet/mobile layouts at the same %. | No device recorded on comments. | Pins on other devices point at nothing. |
| P5 | Element anchoring (`markup_comments.anchor`, `cssPath`/`findAnchor`) exists but only the embed script uses it; the proxy viewer ignores it. | `migrations/021`, `app/embed/v1.js/route.ts:65-100`. | The robust fix is already half-built. |
| P6 | Drawings are normalised to the same unstable document box. | `normalizeShape(shape, w, h)`. | Markup drifts the same way pins do. |

### 1C. Stacking and rendering

| # | Finding | Evidence | Impact |
|---|---|---|---|
| S1 | **The whole overlay is thrown away and rebuilt on every scroll, resize, mutation and hover** (`layer.innerHTML = ''`). | `paint()`; scroll → `schedule` → `paint`. | Flicker, hover enter/leave churn, and a drag breaks if the page scrolls mid-drag. |
| S2 | No overlap handling: pins at nearby spots sit exactly on top of each other. The selected pin isn't raised, so it can be hidden under another. | `paint()` draws in array order. | Clustered feedback is unreadable. |
| S3 | Pins on sticky or fixed elements (headers, cookie bars) scroll away from them. | Overlay is document-space only. | Header feedback floats in the wrong place. |
| S4 | Selecting a comment in the sidebar doesn't scroll the frame to its pin. | No `scrollTo` or `scrollIntoView` in the viewer. | On long pages you can't find the pin. |

### 1D. Page switching

| # | Finding | Evidence | Impact |
|---|---|---|---|
| W1 | **The selected page's pins are drawn on whatever page is in the frame.** Browse to an untracked page and the previous page's pins (and comment list) stay on screen. | `pins = currentImage.pins` (workspace) / `currentThread.pins` (share), regardless of `liveUrl`. | Pins appear on the wrong page. |
| W2 | Workspace matches URLs exactly (`sourceUrl === target`); the share view normalises them (trailing slash, origin). | `workspace.tsx:350` vs `share-viewer.tsx:202`. | `/about` vs `/about/` counts as untracked in one view, can create duplicate pages, and the pins vanish. |
| W3 | Redirects and in-page (SPA) route changes aren't detected. The viewer reads `<base href>`, which the rewriter strips. `X-Proxied-Url` can't be read from an iframe. | `live-viewer.tsx:503`, `proxy-html.ts:276`. | After a redirect or client-side route change, the address bar and pins belong to the old URL. |
| W4 | Switching pages from the sidebar doesn't set `isLoading`. Only address-bar navigation does. | `navigate()` is the only setter. | No loading state. Pins paint before layout settles, then jump (see P1). |
| W5 | A share link whose project was deleted still opens the share view, with a blank frame (the proxy returns 404). | Found during the audit (`f76387cf…`). | Confusing dead end for guests. |

---

## 2. Plan

The phases are ordered by visible impact. Each one ships on its own.

### Phase 1: Images load reliably (fixes A1–A10)

1. **Path-based proxy URLs**, so relative URLs resolve naturally.
   Documents and assets are served from `/api/websites/p/<projectId>/<https|http>/<host>/<path>?<query>`.
   Relative URLs (`assets/x.webp`, `../img.png`) then resolve to proxied paths with no rewriting.
   The old `?url=` endpoint stays as a redirect for compatibility.
2. **Signed proxy cookie instead of per-asset database auth.**
   After the first document request passes the existing access check, set an HttpOnly cookie scoped to `/api/websites/p/<projectId>/`. It's an HS256 JWT signed with `AUTH_SECRET`, lasts 1 hour, and carries the projectId and permission.
   Asset requests only verify the signature. No database calls.
3. **Runtime shim coverage.**
   - Patch `Element.prototype.setAttribute` for `src`, `srcset`, `href`, `poster` and lazy `data-*` attributes.
   - Add `srcset` property setters.
   - Add a `MutationObserver` that rewrites root-relative and off-origin URLs in inserted nodes and `style` attributes. This is the catch-all for `innerHTML`.
4. **Rewriter fixes:** unquoted attributes, entity-quoted `url()`, single-quoted `style`, lazy `data-*` attributes, descriptor-aware `srcset` parsing, and `xlink:href`.
5. **Asset delivery.**
   - Stream bodies instead of buffering them.
   - Forward `Range` and return 206.
   - Pass through `ETag`/`Last-Modified` and answer 304.
   - Cache assets as `private, max-age=3600` (documents stay `no-store`).
   - Send `Referer: <page url>`.
   - Raise the cap for streamed media.
6. **Visible failure hint.** The viewer counts image and CSS errors in the frame and shows "N images couldn't load · Retry" instead of failing silently.
7. *(Optional, only if gaps remain)* A service worker scoped to `/api/websites/p/` that rewrites any stray request from the frame. It's the most complete option, but needs a one-time bootstrap reload.

### Phase 2: Pins stay where they were placed (fixes P1–P6)

1. **Honest measurement.** The overlay becomes a zero-height layer (`height:0; overflow:visible`). Document size is measured without it.
2. **Element anchors for proxy pins.**
   - Move `cssPath`/`findAnchor` out of the embed script into `lib/website/anchor.ts`, shared by the embed script and the viewer.
   - On placement, store in `markup_comments.anchor`: `{selector, xPct, yPct` (within the element)`, elementText, viewportWidth, device, docWidth, docHeight, pageY}`.
   - When painting:
     1. If the element is found (and its text still matches), use a position within the element.
     2. Otherwise use the stored pixel position, scaled by the width ratio.
     3. Otherwise fall back to the legacy percentage.
   - Existing comments keep working through the percentage fallback.
3. **Wait for the page to settle before painting.** Show pins once fonts are ready and the document height has been stable for about 300 ms (maximum 4 s). Until then show a small "placing pins…" state. Keep repainting on real resizes.
4. **Device-aware pins.** Record the device preset (and actual width) on each comment. Pins made on another device are shown differently (see question 1 below).
5. **Drawings follow their pin.** Store shapes with the doc box they were drawn in. When painting, move them by the same offset as their comment's anchor, so markup travels with its element.
6. **Server side:** `createComment`, the share-comment API and pin repositioning accept and persist `anchor`. Dragging a pin re-anchors it to the element under the drop point. No migration is needed: the `anchor` jsonb column already exists (021).

### Phase 3: Clean stacking and rendering (fixes S1–S4)

1. **Incremental overlay.** Keep pin nodes in a map by id and update position and style in place. Scrolling no longer repaints, because the layer is document-space. This fixes the flicker, hover churn and broken drags.
2. **Z-order:** selected > hovered > open > resolved, and newer above older among equals.
3. **Overlap handling.** Pins within about 24 px of each other fan out in a small arc, with a hairline back to their true spot, so every number stays clickable. (Alternative: a cluster badge. See question 2.)
4. **Sticky and fixed elements.** When a pin's anchor sits inside a `position:fixed/sticky` element, draw it in a fixed sub-layer so it stays with the header.
5. **Scroll to pin.** Selecting a comment in the sidebar scrolls the frame so the pin is centred, then pulses it. If the comment is on another page, the viewer switches page, waits for it to settle, then scrolls.
6. **Drag polish:** auto-scroll near the frame edges, and snap back if the save fails (already done on the image side).

### Phase 4: Correct page switching (fixes W1–W5)

1. **One URL matcher** in `lib/website/url.ts`, `matchPage(url, pages)`. It ignores `www.`, trailing slashes, the hash and `utm_*`/`gclid`/`fbclid` parameters. The workspace, the share view and `ensureWebsitePage` all use it, which also stops duplicate pages being created.
2. **Pins belong to the frame's page, not the sidebar selection.** The viewer only shows comments for the page matching the frame's current URL. On an untracked page it shows none, and the comments sidebar says "No comments on this page yet".
3. **Clean transition.** Any change to the frame's source clears pins immediately and shows the loading state. Pins paint after the settle step (Phase 2.3), so there's no flash of the old page's pins and no jumping.
4. **Real URL tracking.** The shim posts `{type:'rv:url', url}` to the parent on load, `pushState`/`replaceState`, `popstate` and `hashchange`. The proxy puts the post-redirect URL into the shim config. The viewer updates `liveUrl`, so redirects and SPA routing keep pins and the address bar correct.
5. **Page state on switch:** close the comment modal, clear the selected pin, and keep mode and tool. Sidebar switches go into the viewer's back/forward history.
6. **Dead share links:** if the share's project no longer exists, show "This review is no longer available" instead of a blank frame.

### Phase 5: Verification

Extend `e2e/website.spec.ts` with a local fixture site served by the test runner. It covers:
- Images inserted via `innerHTML`, unquoted attributes, entity-quoted backgrounds, lazy `data-*` attributes, and Cloudinary-style `srcset`.
- Content that grows after load (a delayed section) and content that shrinks (a closing accordion).
- An SPA route change and a redirect.

Assertions:
- Zero broken images on the fixture.
- A pin stays on its element (±4 px) after content grows or shrinks and after a width change.
- Switching page clears the old pins before new ones appear.
- Untracked pages show no pins.
- Overlapping pins are all clickable.
- Sidebar selection scrolls the pin into view.

---

## 3. Files expected to change

| Area | Files |
|---|---|
| Proxy | `app/api/websites/proxy/route.ts`, new `app/api/websites/p/[...path]/route.ts`, `lib/website/proxy-html.ts`, new `lib/website/proxy-session.ts` |
| Anchors | new `lib/website/anchor.ts`, `app/embed/v1.js/route.ts` (use the shared code) |
| Viewer | `components/website/live-viewer.tsx` (overlay rewrite, settle, anchors, scroll-to-pin, URL messages) |
| Page logic | `app/projects/[id]/workspace.tsx`, `components/share-viewer.tsx`, `lib/website/url.ts`, `app/actions/website-captures.ts` (`ensureWebsitePage`) |
| Comments | `app/actions/comments.ts`, the share-comment API route, the pin-reposition action |
| Share | `app/share/[token]/page.tsx` |
| Tests | `e2e/website.spec.ts`, new `e2e/fixtures/site/*` |

## 4. Open questions for you

1. **Pins made on another device:** show them faded with a device badge (recommended), or hide them until you switch to that device?
2. **Overlapping pins:** fan out (recommended), or collapse into a numbered cluster you click to expand?
3. **Service worker (Phase 1.7):** skip unless needed (recommended), or include it now?
4. **Rollout:** all phases in order, or Phases 1 + 4 first? Those give the biggest visible wins: images load, and pins stop appearing on the wrong page.

## 5. Your additions

_Add any features you want included here, and I'll fold them into the phases above._

-

## 6. Implementation notes

What differs from the plan above, and what is not covered by a test.

- **W5 was wrong.** The share page already answers "not found" when a review is
  deleted; the blank frame in the audit was a review that still existed at the
  time and was deleted later. What was missing was a readable page, so
  `app/share/[token]/not-found.tsx` now says so in words.
- **Embedded third-party frames** (a Vimeo player, a map on another subdomain)
  are redirected to their real address instead of being proxied. They are not
  annotated, never needed to be same-origin, and the site-scope rule was
  refusing them.
- **The embed script keeps its own copy of the selector logic.** The plan said
  to move `cssPath` into the shared module; `app/embed/v1.js` builds a string
  of JavaScript that a bundler must not touch, so the shared TypeScript in
  `lib/website/anchor.ts` mirrors that algorithm instead, and anchors written
  by either one resolve in both (same column, same 0–100 offsets).
- **POST requests are still refused** (405). Replaying a form or an API write
  to the client's site from a review tool is a side effect nobody asked for,
  so an analytics beacon failing behind the proxy is expected.
- **A page that assigns `location.href = '/path'`** in script still escapes the
  proxy: no shim can intercept that. Links, forms, routers and every resource
  are covered.
- **Verified against three live sites** (wohnquartier-geseke-west.de,
  seeleben-lerchenau-muenchen.de, bad-säckingen.wallbach-duett.de) in
  throwaway reviews since deleted: 73 / 100 / 41 images, none broken; a saved
  pin returned to its own element after a full reload; dragging re-anchored it
  to the element it was dropped on and survived a reload; selecting a comment
  scrolled its pin back into view from 5,500px down; the device badge appeared
  when switching to tablet; page switches never leaked the previous page's
  pins.
- **Domain-locked embeds cannot play here.** Providers like Vimeo answer 401 to
  any server-side fetch (with or without the site as referrer) and check the
  embedding domain in the browser, so a video restricted to the client's domain
  shows the provider's own error inside the review. Ordinary embeds (maps,
  public videos) load normally, straight from the provider.
- **Fixtures:** `e2e/fixtures/seed.mjs` now also seeds a website review over
  example.com with a share token and six pins — anchored, overlapping, legacy
  percentage, mobile-device, and one on a second page.
