// Entry point: fetch country data, project everything, mount one SVG.

import { bounds } from './projection.js';
import { featureToPath, graticulePaths, outlinePath } from './render.js';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const res = await fetch('data/world.geojson');
if (!res.ok) throw new Error(`failed to load map data: ${res.status}`);
const geojson = await res.json();

const b = bounds();
const svg = document.getElementById('map');
svg.setAttribute('viewBox', `${fmt(b.xMax * -1)} ${fmt(b.yMax * -1)} ${fmt(b.width)} ${fmt(b.height)}`);

const graticule = graticulePaths()
  .map((d) => `<path class="graticule" d="${d}"/>`)
  .join('');

const countries = geojson.features
  .map((f) => {
    const name = f.properties.ADMIN || f.properties.NAME || 'Unknown';
    const d = featureToPath(f);
    return `<path class="country" data-name="${esc(name)}" fill-rule="evenodd" d="${d}"><title>${esc(name)}</title></path>`;
  })
  .join('');

const outline = `<path class="outline" d="${outlinePath()}"/>`;

svg.innerHTML = graticule + countries + outline;

function fmt(v) {
  return (Math.round(v * 1e4) / 1e4).toString();
}
