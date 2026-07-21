/**
 * Shared helpers for the virtual-tour Pannellum viewers (editor + player).
 * DOM-only module — safe to import from client components.
 */

/**
 * Pannellum uploads the panorama to a WebGL texture, which requires a
 * CORS-enabled image. Pannellum requests panoramas with `crossOrigin:
 * 'anonymous'` (its default), and Supabase Storage serves public objects with
 * `Access-Control-Allow-Origin: *`, so remote images load directly from
 * Supabase's CDN — no same-origin proxy needed. (Previously these were routed
 * through /api/panorama-proxy, which streamed every full-size image through a
 * serverless function and burned host bandwidth; serving direct is free.)
 * Returned unchanged so local paths (placeholders, blob URLs) also pass through.
 */
export function panoramaSrc(url: string): string {
  return url;
}

export interface TourMarkerArgs {
  label: string;
  /** Editor-only: highlight the currently selected hotspot. */
  selected?: boolean;
  onClick: () => void;
}

const ARROW_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';

/**
 * Build the DOM for a Biganto-style navigation marker: a glassy circular
 * button with an up-chevron plus a label pill underneath. Called by Pannellum,
 * which centers the wrapper element at the hotspot's pitch/yaw.
 */
export function buildTourHotspotMarker(hotSpotDiv: HTMLElement, args: TourMarkerArgs) {
  hotSpotDiv.classList.add('tour-nav-hotspot');

  const ring = document.createElement('div');
  ring.style.cssText = [
    'width:44px', 'height:44px', 'border-radius:9999px',
    'background:rgba(255,255,255,.22)',
    'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)',
    `border:2px solid ${args.selected ? '#f97316' : 'rgba(255,255,255,.9)'}`,
    'color:#fff', 'display:flex', 'align-items:center', 'justify-content:center',
    'cursor:pointer', 'transform:translate(-50%,-50%)',
    'box-shadow:0 2px 10px rgba(0,0,0,.35)',
    'transition:transform .15s ease, background .15s ease',
    args.selected ? 'background:rgba(249,115,22,.45)' : '',
  ].join(';');
  ring.innerHTML = ARROW_SVG;

  const halo = document.createElement('div');
  halo.style.cssText = [
    'position:absolute', 'left:0', 'top:0', 'width:44px', 'height:44px',
    'border-radius:9999px', 'border:2px solid rgba(255,255,255,.55)',
    'transform:translate(-50%,-50%)', 'pointer-events:none',
    'animation:tour-hotspot-pulse 2.2s ease-out infinite',
  ].join(';');

  const label = document.createElement('div');
  label.textContent = args.label;
  label.style.cssText = [
    'position:absolute', 'top:26px', 'left:0', 'transform:translateX(-50%)',
    'padding:3px 10px', 'border-radius:9999px',
    'background:rgba(0,0,0,.55)', 'color:#fff',
    'font-size:12px', 'font-weight:600', 'white-space:nowrap',
    'pointer-events:none', 'backdrop-filter:blur(2px)',
    'box-shadow:0 1px 4px rgba(0,0,0,.3)',
  ].join(';');

  ring.addEventListener('mouseenter', () => { ring.style.transform = 'translate(-50%,-50%) scale(1.12)'; });
  ring.addEventListener('mouseleave', () => { ring.style.transform = 'translate(-50%,-50%)'; });
  ring.addEventListener('click', (e) => { e.stopPropagation(); args.onClick(); });

  hotSpotDiv.appendChild(halo);
  hotSpotDiv.appendChild(ring);
  hotSpotDiv.appendChild(label);
}
