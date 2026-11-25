(function (root) {
  const PR = (root.PR = root.PR || {});
  const TILE = 64;

  function fillCell(ctx, x0, y0, x1, y1, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  function label(ctx, text, x0, y0, x1, y1, color) {
    const size = Math.min(x1 - x0, y1 - y0);
    if (size < 14) return;
    ctx.fillStyle = color;
    ctx.font = 'bold ' + Math.floor(Math.min(size * 0.6, 28)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, (x0 + x1) / 2, (y0 + y1) / 2);
  }

  function drawPlacement(ctx, p, view, cellPx, alpha) {
    const B = root.PR.Blocks;
    const x0 = Math.round(view.x + p.x * cellPx);
    const y0 = Math.round(view.y + p.y * cellPx);
    const x1 = Math.round(view.x + (p.x + p.w) * cellPx);
    const y1 = Math.round(view.y + (p.y + p.h) * cellPx);
    const def = B.get(p.b);
    ctx.globalAlpha = alpha;
    if (!def) {
      fillCell(ctx, x0, y0, x1, y1, '#ff00ff');
      label(ctx, '?', x0, y0, x1, y1, '#220022');
    } else {
      const img = B.image(p.b);
      if (cellPx < 6 || !img) {
        fillCell(ctx, x0, y0, x1, y1, def.color);
        if (!img && cellPx >= 6) label(ctx, def.name.charAt(0), x0, y0, x1, y1, 'rgba(255,255,255,0.7)');
      } else {
        ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMarker(ctx, pt, text, color, view, cellPx) {
    const x0 = Math.round(view.x + pt.x * cellPx);
    const y0 = Math.round(view.y + pt.y * cellPx);
    const x1 = Math.round(view.x + (pt.x + 1) * cellPx);
    const y1 = Math.round(view.y + (pt.y + 1) * cellPx);
    ctx.globalAlpha = 0.85;
    fillCell(ctx, x0, y0, x1, y1, color);
    ctx.globalAlpha = 1;
    label(ctx, text, x0, y0, x1, y1, '#fff');
  }

  function drawMap(ctx, map, view, opts) {
    const { viewW, viewH, showGrid, ghost, rect } = opts;
    const VM = root.PR.ViewMath;
    const cellPx = TILE * view.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, viewW, viewH);
    const mx = Math.round(view.x), my = Math.round(view.y);
    const mw = Math.round(map.width * cellPx), mh = Math.round(map.height * cellPx);
    ctx.fillStyle = '#101010';
    ctx.fillRect(mx, my, mw, mh);

    const r = VM.visibleCellRange(view, viewW, viewH, map.width, map.height);
    let drawn = 0;
    if (r.x1 >= r.x0 && r.y1 >= r.y0) {
      for (const layer of ['floor', 'objects']) {
        for (const p of map.layers[layer]) {
          if (p.x + p.w - 1 < r.x0 || p.x > r.x1 || p.y + p.h - 1 < r.y0 || p.y > r.y1) continue;
          drawPlacement(ctx, p, view, cellPx, 1);
          drawn++;
        }
      }
      if (map.start) drawMarker(ctx, map.start, 'S', '#1faa4a', view, cellPx);
      for (const e of map.exits) drawMarker(ctx, e, 'E', '#d23b3b', view, cellPx);

      if (showGrid && cellPx >= 8) {
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = r.x0; x <= r.x1 + 1; x++) {
          const sx = Math.round(view.x + x * cellPx) + 0.5;
          ctx.moveTo(sx, Math.round(view.y + r.y0 * cellPx));
          ctx.lineTo(sx, Math.round(view.y + (r.y1 + 1) * cellPx));
        }
        for (let y = r.y0; y <= r.y1 + 1; y++) {
          const sy = Math.round(view.y + y * cellPx) + 0.5;
          ctx.moveTo(Math.round(view.x + r.x0 * cellPx), sy);
          ctx.lineTo(Math.round(view.x + (r.x1 + 1) * cellPx), sy);
        }
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx - 1, my - 1, mw + 2, mh + 2);

    if (ghost) {
      const b = ghost.block;
      const gp = { b: b.id, x: ghost.x, y: ghost.y, w: b.w, h: b.h };
      drawPlacement(ctx, gp, view, cellPx, 0.55);
      if (!ghost.valid) {
        ctx.globalAlpha = 0.45;
        fillCell(ctx, Math.round(view.x + gp.x * cellPx), Math.round(view.y + gp.y * cellPx),
          Math.round(view.x + (gp.x + gp.w) * cellPx), Math.round(view.y + (gp.y + gp.h) * cellPx), '#ff2020');
        ctx.globalAlpha = 1;
      }
    }
    if (rect) {
      const rx0 = Math.round(view.x + Math.min(rect.x0, rect.x1) * cellPx);
      const ry0 = Math.round(view.y + Math.min(rect.y0, rect.y1) * cellPx);
      const rx1 = Math.round(view.x + (Math.max(rect.x0, rect.x1) + 1) * cellPx);
      const ry1 = Math.round(view.y + (Math.max(rect.y0, rect.y1) + 1) * cellPx);
      ctx.globalAlpha = 0.18;
      fillCell(ctx, rx0, ry0, rx1, ry1, '#ffffff');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx0 + 1, ry0 + 1, rx1 - rx0 - 2, ry1 - ry0 - 2);
    }
    return { drawn };
  }

  function drawThumbnail(canvas, map) {
    const ctx = canvas.getContext('2d');
    const view = root.PR.ViewMath.fitView(map.width, map.height, canvas.width, canvas.height, 4);
    drawMap(ctx, map, view, { viewW: canvas.width, viewH: canvas.height, showGrid: false });
  }

  PR.Render = { drawMap, drawThumbnail };
  if (typeof module !== 'undefined') module.exports = PR.Render;
})(typeof globalThis !== 'undefined' ? globalThis : window);
