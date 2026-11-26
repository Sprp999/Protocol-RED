(function (root) {
  const PR = (root.PR = root.PR || {});
  const TILE = 64;
  const MAGENTA = '#ff00ff';
  // 한 칸이 화면에서 이 크기(px)보다 작으면 칸마다 그리지 않고 맵 전체를 한 장의 작은 그림으로 늘려 붙인다
  const RASTER_BELOW = 3;

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
      fillCell(ctx, x0, y0, x1, y1, MAGENTA);
      label(ctx, '?', x0, y0, x1, y1, '#220022');
    } else {
      const level = B.imageFor(p.b, x1 - x0);
      if (cellPx < 6 || !level) {
        fillCell(ctx, x0, y0, x1, y1, def.color);
        if (!level && cellPx >= 6) label(ctx, def.name.charAt(0), x0, y0, x1, y1, 'rgba(255,255,255,0.7)');
      } else {
        // 줄여서 그릴 때는 부드럽게(깨짐 방지), 원본보다 크게 늘릴 때만 픽셀이 번지지 않게
        ctx.imageSmoothingEnabled = x1 - x0 < level.w;
        ctx.drawImage(level.src, x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 아주 작게 볼 때: 맵 전체를 1칸=1픽셀 그림 한 장으로 ----------
  const rasters = new WeakMap(); // 맵 → { rev, canvas }
  const rgbCache = new Map();

  function rgbOf(blockId) {
    if (rgbCache.has(blockId)) return rgbCache.get(blockId);
    const def = root.PR.Blocks.get(blockId);
    const hex = (def ? def.color : MAGENTA).replace('#', '');
    const n = parseInt(hex, 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(blockId, rgb);
    return rgb;
  }

  function rasterOf(map) {
    const rev = root.PR.MapModel.revision(map);
    const cached = rasters.get(map);
    if (cached && cached.rev === rev && cached.canvas.width === map.width && cached.canvas.height === map.height) {
      return cached.canvas;
    }
    const canvas = cached ? cached.canvas : document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const g = canvas.getContext('2d');
    const image = g.createImageData(map.width, map.height); // 처음엔 전부 투명(=배경 검정)
    const data = image.data;
    for (const layer of root.PR.MapModel.LAYERS) {
      for (const p of map.layers[layer]) {
        const [r, gr, b] = rgbOf(p.b);
        for (let yy = p.y; yy < p.y + p.h; yy++) {
          let i = (yy * map.width + p.x) * 4;
          for (let xx = 0; xx < p.w; xx++, i += 4) {
            data[i] = r; data[i + 1] = gr; data[i + 2] = b; data[i + 3] = 255;
          }
        }
      }
    }
    g.putImageData(image, 0, 0);
    rasters.set(map, { rev, canvas });
    return canvas;
  }

  function drawMap(ctx, map, view, opts) {
    const { viewW, viewH, showGrid, ghost, rect } = opts;
    const VM = root.PR.ViewMath;
    const MM = root.PR.MapModel;
    const cellPx = TILE * view.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, viewW, viewH);
    const mx = Math.round(view.x), my = Math.round(view.y);
    const mw = Math.round(map.width * cellPx), mh = Math.round(map.height * cellPx);
    // 맵 안쪽도 배경과 같은 검정이다. 맵의 경계는 테두리선과 격자선으로 보인다.
    ctx.fillStyle = '#000';
    ctx.fillRect(mx, my, mw, mh);

    const r = VM.visibleCellRange(view, viewW, viewH, map.width, map.height);
    let drawn = 0;
    if (r.x1 >= r.x0 && r.y1 >= r.y0) {
      if (cellPx < RASTER_BELOW) {
        ctx.drawImage(rasterOf(map), 0, 0, map.width, map.height, view.x, view.y, map.width * cellPx, map.height * cellPx);
        drawn = MM.countPlacements(map);
      } else {
        for (const layer of MM.LAYERS) {
          for (const p of MM.placementsInRect(map, layer, r.x0, r.y0, r.x1, r.y1)) {
            drawPlacement(ctx, p, view, cellPx, 1);
            drawn++;
          }
        }
      }

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

  // 맵 목록의 작은 그림: 맵을 만들지 않고 저장된 데이터(줄 단위)에서 바로 그린다
  function drawThumbnailData(canvas, data) {
    const ctx = canvas.getContext('2d');
    const margin = 4;
    const s = Math.min((canvas.width - margin * 2) / data.width, (canvas.height - margin * 2) / data.height);
    const ox = (canvas.width - data.width * s) / 2;
    const oy = (canvas.height - data.height * s) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(ox), Math.round(oy), Math.round(data.width * s), Math.round(data.height * s));
    const B = root.PR.Blocks;
    for (const layer of root.PR.MapModel.LAYERS) {
      for (const [b, x, y, n] of data[layer] || []) {
        const size = B.sizeOf(b) || { w: 1, h: 1 };
        const def = B.get(b);
        const x0 = Math.floor(ox + x * s), x1 = Math.ceil(ox + (x + n * size.w) * s);
        const y0 = Math.floor(oy + y * s), y1 = Math.ceil(oy + (y + size.h) * s);
        fillCell(ctx, x0, y0, x1, y1, def ? def.color : MAGENTA);
      }
    }
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(data.width * s) + 1, Math.round(data.height * s) + 1);
  }

  PR.Render = { drawMap, drawThumbnailData };
  if (typeof module !== 'undefined') module.exports = PR.Render;
})(typeof globalThis !== 'undefined' ? globalThis : window);
