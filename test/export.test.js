import test from 'node:test';
import assert from 'node:assert/strict';

import { EXPORT_CSS, OCEAN, exportFilename, svgExportString } from '../src/export.js';

test('standalone SVG: namespace, viewBox passthrough, sized, titled, styled', () => {
  const body = `<path class="country" d="M0 0L1 0L1 1Z"/><path class="graticule" d="M-2 0L2 0"/>`;
  const out = svgExportString({
    viewBox: '-2.78 -1.32 5.56 2.63',
    body,
    title: 'Equal Earth · Greenland · ×3 zoom',
    width: 2000,
  });
  assert.ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(out.endsWith('</svg>'));
  assert.ok(out.includes('viewBox="-2.78 -1.32 5.56 2.63"'));
  // height follows the viewBox aspect: 2000 * 2.63/5.56 ≈ 946
  assert.ok(out.includes('width="2000" height="946"'));
  assert.ok(out.includes('<title>Equal Earth · Greenland · ×3 zoom</title>'));
  assert.ok(out.includes('aria-label="Equal Earth · Greenland · ×3 zoom"'));
  assert.ok(out.includes('<style>'));
  assert.ok(out.includes('.country {'));
  assert.ok(out.includes('.pinned'));
  // the body we passed is in there verbatim
  assert.ok(out.includes(body));
});

test('title is XML-escaped; background rect is first painted element', () => {
  const out = svgExportString({
    viewBox: '0 0 1 1',
    body: '<path class="country" d="M0 0L1 1Z"/>',
    title: 'Côte d\'Ivoire & Ghana <vs> "pin"',
  });
  assert.ok(out.includes('Côte d\'Ivoire &amp; Ghana &lt;vs&gt; &quot;pin&quot;'));
  assert.ok(!/aria-label="[^"]*<[^"]*"/.test(out));
  // ocean rect covers the whole viewBox and precedes the map body
  const bg = `<rect x="0" y="0" width="1" height="1" fill="${OCEAN}"/>`;
  const bgAt = out.indexOf(bg);
  const bodyAt = out.indexOf('<path class="country"');
  assert.ok(bgAt > 0, 'background rect present');
  assert.ok(bgAt < bodyAt, 'background paints before countries');
});

test('exported CSS paints every overlay, keeps hairline strokes, drops hover', () => {
  for (const sel of ['.country', '.pinned', '.graticule', '.outline', '.ghost', '.compare', '.tissot']) {
    assert.ok(EXPORT_CSS.includes(sel), `missing ${sel}`);
  }
  // without this the 1px strokes blow up ~288× at export scale into blobs
  assert.ok(EXPORT_CSS.includes('vector-effect: non-scaling-stroke'));
  assert.ok(!EXPORT_CSS.includes(':hover'));
  assert.ok(!EXPORT_CSS.includes('cursor'));
});

test('filename carries pin and morph state', () => {
  assert.equal(exportFilename(), 'equal-earth.svg');
  assert.equal(exportFilename({ pinned: 'Greenland' }), 'equal-earth-greenland.svg');
  assert.equal(
    exportFilename({ pinned: "Côte d'Ivoire", morphPct: 42 }),
    'equal-earth-cote-d-ivoire-morph42.svg',
  );
});

test('bad viewBox throws instead of writing a broken file', () => {
  assert.throws(() => svgExportString({ viewBox: '0 0 0 0', body: '' }));
  assert.throws(() => svgExportString({ viewBox: 'nan', body: '' }));
});
