// Viewport math for the zoomable map. A view is {cx, cy, w} in map units;
// the viewBox height follows from the map's fixed aspect ratio, so zooming
// never changes the frame shape (no layout jumps). All functions are pure —
// main.js only wires them to pointer/wheel events.

export const MAX_ZOOM = 64;

// [x, y, w, h] viewBox string for a view over a map of aspect w/h.
export function viewBoxOf(view, aspect) {
  const h = view.w / aspect;
  return `${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`;
}

// Keep w within [worldW/MAX_ZOOM, worldW] and the visible rect inside the
// world's bounding box (center pinned at 0 when fully zoomed out).
export function clampView(view, world, aspect) {
  const w = Math.min(world.width, Math.max(world.width / MAX_ZOOM, view.w));
  const h = w / aspect;
  const hx = Math.max(0, world.xMax - w / 2);
  const hy = Math.max(0, world.yMax - h / 2);
  return {
    cx: Math.min(hx, Math.max(-hx, view.cx)),
    cy: Math.min(hy, Math.max(-hy, view.cy)),
    w,
  };
}

// Zoom by factor (>1 zooms in, w shrinks) keeping the map point (fx, fy)
// under the cursor fixed.
export function zoomView(view, fx, fy, factor, world, aspect) {
  const w1 = view.w / factor;
  const k = w1 / view.w;
  return clampView(
    { cx: fx - (fx - view.cx) * k, cy: fy - (fy - view.cy) * k, w: w1 },
    world,
    aspect,
  );
}

// Client coordinates -> map coordinates (SVG user units, y down).
export function screenToMap(px, py, rect, view, aspect) {
  const h = view.w / aspect;
  return [
    view.cx - view.w / 2 + ((px - rect.left) / rect.width) * view.w,
    view.cy - h / 2 + ((py - rect.top) / rect.height) * h,
  ];
}
