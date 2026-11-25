(function (root) {
  const PR = (root.PR = root.PR || {});

  const MIN_SCALE = 0.04;
  const MAX_SCALE = 4;
  const TILE = 64;

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  function fitView(mapW, mapH, viewW, viewH, margin = 24) {
    const sx = (viewW - margin * 2) / (mapW * TILE);
    const sy = (viewH - margin * 2) / (mapH * TILE);
    const scale = clampScale(Math.min(sx, sy));
    return {
      scale,
      x: (viewW - mapW * TILE * scale) / 2,
      y: (viewH - mapH * TILE * scale) / 2,
    };
  }

  function zoomAt(view, factor, px, py) {
    const scale = clampScale(view.scale * factor);
    const k = scale / view.scale;
    return { scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
  }

  function panBy(view, dx, dy) {
    return { scale: view.scale, x: view.x + dx, y: view.y + dy };
  }

  function screenToCell(view, px, py) {
    const cell = TILE * view.scale;
    return { x: Math.floor((px - view.x) / cell), y: Math.floor((py - view.y) / cell) };
  }

  function visibleCellRange(view, viewW, viewH, mapW, mapH) {
    const cell = TILE * view.scale;
    return {
      x0: Math.max(0, Math.floor(-view.x / cell)),
      y0: Math.max(0, Math.floor(-view.y / cell)),
      x1: Math.min(mapW - 1, Math.floor((viewW - view.x) / cell)),
      y1: Math.min(mapH - 1, Math.floor((viewH - view.y) / cell)),
    };
  }

  PR.ViewMath = { MIN_SCALE, MAX_SCALE, TILE, fitView, zoomAt, panBy, screenToCell, visibleCellRange };
  if (typeof module !== 'undefined') module.exports = PR.ViewMath;
})(typeof globalThis !== 'undefined' ? globalThis : window);
