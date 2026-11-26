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

  // 이번에 그린 것 중 가장 빠른 애니메이션의 초당 프레임 (0이면 움직이는 게 없다)
  let animFps = 0;
  let clock = 0;

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
      const fps = B.animFpsOf(p.b);
      const level = B.imageFor(p.b, x1 - x0, fps ? B.frameAt(p.b, clock) : 0);
      if (fps && level && cellPx >= 6) animFps = Math.max(animFps, fps);
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

  // ---------- 검은 빈 칸에 닿은 블록의 가장자리를 어둡게 (그라데이션) ----------
  const SHADE_MIN_CELL = 8;      // 칸이 이보다 작으면 티가 안 나서 그리지 않는다
  const SHADE_DEPTH = 0.32;      // 칸 크기에 대한 어두운 폭
  const SHADE_ALPHA = 0.65;      // 가장자리 끝의 어두운 정도
  const shadeCache = new Map();  // 칸 크기(px) → 가장자리·모서리 그림 모음

  // [x0..x1]×[y0..y1] 안에서, 블록이 있는데 이웃이 빈 칸(또는 맵 밖)인 칸과 어느 변·모서리가 닿는지 돌려준다.
  function edgeShadeCells(map, x0, y0, x1, y1) {
    const occ = root.PR.MapModel.isOccupied;
    const out = [];
    for (let y = Math.max(0, y0); y <= Math.min(map.height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(map.width - 1, x1); x++) {
        if (!occ(map, x, y)) continue;
        const top = !occ(map, x, y - 1), bottom = !occ(map, x, y + 1);
        const left = !occ(map, x - 1, y), right = !occ(map, x + 1, y);
        // 안쪽 모서리: 위·옆은 채워져 있는데 대각선만 비어 있는 경우
        const cornerTL = !top && !left && !occ(map, x - 1, y - 1);
        const cornerTR = !top && !right && !occ(map, x + 1, y - 1);
        const cornerBL = !bottom && !left && !occ(map, x - 1, y + 1);
        const cornerBR = !bottom && !right && !occ(map, x + 1, y + 1);
        if (top || bottom || left || right || cornerTL || cornerTR || cornerBL || cornerBR) {
          out.push({ x, y, top, right, bottom, left, cornerTL, cornerTR, cornerBL, cornerBR });
        }
      }
    }
    return out;
  }

  function makeShadeSprites(size) {
    const d = Math.max(2, Math.round(size * SHADE_DEPTH));
    const make = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      return c;
    };
    const stops = (g) => {
      g.addColorStop(0, 'rgba(0,0,0,' + SHADE_ALPHA + ')');
      g.addColorStop(0.5, 'rgba(0,0,0,' + (SHADE_ALPHA * 0.35) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      return g;
    };
    const linear = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const c = make();
      const g = c.getContext('2d');
      g.fillStyle = stops(g.createLinearGradient(x0, y0, x1, y1));
      g.fillRect(rx, ry, rw, rh);
      return c;
    };
    const corner = (cx, cy, rx, ry) => {
      const c = make();
      const g = c.getContext('2d');
      g.fillStyle = stops(g.createRadialGradient(cx, cy, 0, cx, cy, d));
      g.fillRect(rx, ry, d, d);
      return c;
    };
    return {
      top: linear(0, 0, 0, d, 0, 0, size, d),
      bottom: linear(0, size, 0, size - d, 0, size - d, size, d),
      left: linear(0, 0, d, 0, 0, 0, d, size),
      right: linear(size, 0, size - d, 0, size - d, 0, d, size),
      cornerTL: corner(0, 0, 0, 0),
      cornerTR: corner(size, 0, size - d, 0),
      cornerBL: corner(0, size, 0, size - d),
      cornerBR: corner(size, size, size - d, size - d),
    };
  }

  function shadeSprites(cellPx) {
    const size = Math.max(SHADE_MIN_CELL, Math.round(cellPx));
    let sprites = shadeCache.get(size);
    if (!sprites) {
      if (shadeCache.size > 12) shadeCache.clear();
      sprites = makeShadeSprites(size);
      shadeCache.set(size, sprites);
    }
    return sprites;
  }

  function drawEdgeShade(ctx, map, view, cellPx, r) {
    const sprites = shadeSprites(cellPx);
    let count = 0;
    for (const c of edgeShadeCells(map, r.x0, r.y0, r.x1, r.y1)) {
      const x0 = Math.round(view.x + c.x * cellPx), y0 = Math.round(view.y + c.y * cellPx);
      const x1 = Math.round(view.x + (c.x + 1) * cellPx), y1 = Math.round(view.y + (c.y + 1) * cellPx);
      for (const kind of ['top', 'right', 'bottom', 'left', 'cornerTL', 'cornerTR', 'cornerBL', 'cornerBR']) {
        if (c[kind]) {
          ctx.drawImage(sprites[kind], x0, y0, x1 - x0, y1 - y0);
          count++;
        }
      }
    }
    return count;
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

  function drawStartFlag(ctx, start, view, cellPx) {
    if (cellPx < 6) {
      // 아주 작게 볼 때도 찾을 수 있게 6픽셀 빨간 점으로
      const cx = view.x + (start.x + 0.5) * cellPx, cy = view.y + (start.y + 0.5) * cellPx;
      fillCell(ctx, Math.round(cx - 3), Math.round(cy - 3), Math.round(cx + 3), Math.round(cy + 3), '#e5483c');
      return;
    }
    drawPlacement(ctx, { b: 'start_flag', x: start.x, y: start.y, w: 1, h: 1 }, view, cellPx, 1);
  }

  function drawMap(ctx, map, view, opts) {
    const { viewW, viewH, showGrid, ghost, rect, markers, edgeShade } = opts;
    animFps = 0;
    let shaded = 0;
    clock = opts.time !== undefined ? opts.time : Date.now();
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

      // 게임 화면과 같은 모양: 블록이 검은 빈 칸에 닿는 가장자리를 살짝 어둡게 (칸이 충분히 클 때만)
      if (edgeShade && cellPx >= SHADE_MIN_CELL) shaded = drawEdgeShade(ctx, map, view, cellPx, r);

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

    // 에디터에서만 보이는 시작점 깃발 (플레이용 그리기에서는 markers 를 켜지 않는다)
    if (markers && map.start && r.x1 >= r.x0 && r.y1 >= r.y0) drawStartFlag(ctx, map.start, view, cellPx);

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
    return { drawn, animated: animFps, shaded };
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

  PR.Render = { drawMap, drawThumbnailData, edgeShadeCells };
  if (typeof module !== 'undefined') module.exports = PR.Render;
})(typeof globalThis !== 'undefined' ? globalThis : window);
