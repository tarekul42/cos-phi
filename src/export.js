// Standalone SVG export: serialize the live map (current zoom/pan/morph/pin
// state) into one self-contained SVG file — styles inlined, ocean background
// baked in, a human-readable title for file managers and alt text.
//
// The builder is pure (strings in, string out) so node can test it and the
// browser just wires a Blob download around it. EXPORT_CSS mirrors the map
// rules in index.html; hover/pinning interactivity is dropped (a file can't
// hover), but .pinned STAYS — the exported file captures who was pinned.

export const OCEAN = '#10233c';

// Mirror of the on-screen map styles (index.html). No :hover, no transitions,
// no layout CSS — only what paints paths inside the SVG.
export const EXPORT_CSS = `
svg path { vector-effect: non-scaling-stroke; }
.country { fill: #8fbf9f; stroke: ${OCEAN}; stroke-width: 0.75px; stroke-linejoin: round; }
.country.pinned { fill: #ffb703; stroke: #ffffff; stroke-width: 1.3px; }
.graticule { fill: none; stroke: rgba(255,255,255,0.09); stroke-width: 0.5px; }
.outline { fill: none; stroke: rgba(255,255,255,0.5); stroke-width: 1.1px; stroke-linejoin: round; }
.ghost { fill: rgba(255,80,80,0.14); stroke: #ff6b6b; stroke-width: 1px; stroke-dasharray: 3.5 2.4; stroke-linejoin: round; }
.compare { fill: rgba(90,160,255,0.16); stroke: #5aa9ff; stroke-width: 1.3px; stroke-linejoin: round; }
.tissot { fill: rgba(255,120,90,0.22); stroke: #ff785a; stroke-width: 1px; stroke-linejoin: round; }
`.trim();

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build the full SVG document. viewBox is the live "x y w h" string (y grows
// down, as in the page); body is the live SVG inner markup with every path's
// current d — that's what freezes morph/pin/zoom state into the file.
export function svgExportString({
  viewBox,
  body,
  title = 'Equal Earth map',
  css = EXPORT_CSS,
  width = 1600,
}) {
  const [vx, vy, vw, vh] = String(viewBox).trim().split(/\s+/).map(Number);
  if (!isFinite(vx) || !isFinite(vy) || !(vw > 0) || !(vh > 0)) {
    throw new Error(`bad viewBox: ${viewBox}`);
  }
  const height = Math.round((width * vh) / vw);
  const t = escapeXml(title);
  const bg = `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${OCEAN}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(viewBox)}" ` +
    `width="${width}" height="${height}" role="img" aria-label="${t}">` +
    `<title>${t}</title>` +
    `<style>${css}</style>` +
    bg +
    body +
    `</svg>`
  );
}

// equal-earth.svg, equal-earth-greenland.svg, equal-earth-greenland-morph42.svg
export function exportFilename({ pinned = null, morphPct = 0 } = {}) {
  const slug = (s) =>
    String(s)
      .normalize('NFD') // decompose accents: ô -> o + combining mark
      .replace(/[\u0300-\u036f]/g, '') // drop the marks
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  let name = 'equal-earth';
  if (pinned) name += '-' + slug(pinned);
  if (morphPct > 0) name += `-morph${Math.round(morphPct)}`;
  return name + '.svg';
}
