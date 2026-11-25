(function (root) {
  const PR = (root.PR = root.PR || {});

  const LAYERS = ['floor', 'objects'];
  const MAX_SIZE = 1000;

  function checkSize(width, height) {
    for (const v of [width, height]) {
      if (!Number.isInteger(v) || v < 1 || v > MAX_SIZE) {
        throw new RangeError('맵 크기는 1~' + MAX_SIZE + ' 사이의 정수여야 해요.');
      }
    }
  }

  // 칸 조회용 숨은 색인: 층마다 칸 → uid(0이면 빈 칸), uid → 배치, uid → 배열 위치
  function attachIndex(map) {
    const idx = {};
    for (const layer of LAYERS) {
      idx[layer] = {
        cells: new Int32Array(map.width * map.height),
        byUid: new Map(),
        pos: new Map(),
      };
    }
    Object.defineProperty(map, '_idx', { value: idx, enumerable: false, writable: true });
    // 맵이 바뀔 때마다 커지는 번호. 그림 캐시가 낡았는지 알아보는 데 쓴다.
    Object.defineProperty(map, '_rev', { value: 0, enumerable: false, writable: true });
  }

  function addPlacement(map, layer, p) {
    const ix = map._idx[layer];
    ix.pos.set(p.uid, map.layers[layer].length);
    map.layers[layer].push(p);
    ix.byUid.set(p.uid, p);
    for (let yy = p.y; yy < p.y + p.h; yy++) {
      for (let xx = p.x; xx < p.x + p.w; xx++) ix.cells[yy * map.width + xx] = p.uid;
    }
    if (p.uid >= map.nextUid) map.nextUid = p.uid + 1;
    map._rev++;
  }

  function removePlacement(map, layer, uid) {
    const ix = map._idx[layer];
    const p = ix.byUid.get(uid);
    if (!p) return;
    for (let yy = p.y; yy < p.y + p.h; yy++) {
      for (let xx = p.x; xx < p.x + p.w; xx++) ix.cells[yy * map.width + xx] = 0;
    }
    // 마지막 항목을 빈자리로 옮겨 O(1)로 제거
    const arr = map.layers[layer];
    const at = ix.pos.get(uid);
    const last = arr.pop();
    if (last.uid !== uid) {
      arr[at] = last;
      ix.pos.set(last.uid, at);
    }
    ix.pos.delete(uid);
    ix.byUid.delete(uid);
    map._rev++;
  }

  function createMap({ id, name, width, height }) {
    checkSize(width, height);
    const map = {
      version: 1,
      id,
      name,
      width,
      height,
      tileSize: 64,
      layers: { floor: [], objects: [] },
      start: null,
      exits: [],
      nextUid: 1,
    };
    attachIndex(map);
    return map;
  }

  function inBounds(map, x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
  }

  function placementAt(map, layer, x, y) {
    if (!inBounds(map, x, y)) return null;
    const uid = map._idx[layer].cells[y * map.width + x];
    return uid ? map._idx[layer].byUid.get(uid) : null;
  }

  function revision(map) {
    return map._rev;
  }

  // 사각형(칸 좌표, 끝 칸 포함)에 걸친 배치를 한 번씩만 돌려준다. 맵 밖은 잘라서 본다.
  function placementsInRect(map, layer, x0, y0, x1, y1) {
    const out = [];
    const { cells, byUid } = map._idx[layer];
    const ax = Math.max(0, x0), ay = Math.max(0, y0);
    const bx = Math.min(map.width - 1, x1), by = Math.min(map.height - 1, y1);
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) {
        const uid = cells[y * map.width + x];
        if (!uid) continue;
        const p = byUid.get(uid);
        // 걸친 배치는 사각형 안에서 가장 왼쪽 위 칸에서만 한 번 담는다
        if (x === Math.max(p.x, ax) && y === Math.max(p.y, ay)) out.push(p);
      }
    }
    return out;
  }

  function countPlacements(map) {
    return map.layers.floor.length + map.layers.objects.length;
  }

  // 사각형 안에 걸친 배치들의 uid(중복 없이)
  function uidsInRect(map, layer, x0, y0, x1, y1) {
    const found = new Set();
    const cells = map._idx[layer].cells;
    for (let yy = Math.max(0, y0); yy <= Math.min(map.height - 1, y1); yy++) {
      for (let xx = Math.max(0, x0); xx <= Math.min(map.width - 1, x1); xx++) {
        const uid = cells[yy * map.width + xx];
        if (uid) found.add(uid);
      }
    }
    return found;
  }

  function placeOp(map, layer, block, x, y) {
    const { w, h } = block;
    if (!inBounds(map, x, y) || x + w > map.width || y + h > map.height) return null;
    const overlapped = uidsInRect(map, layer, x, y, x + w - 1, y + h - 1);
    if (overlapped.size === 1) {
      const [uid] = overlapped;
      const old = map._idx[layer].byUid.get(uid);
      if (old.b === block.id && old.x === x && old.y === y && old.w === w && old.h === h) return null;
    }
    const removed = [...overlapped].map((uid) => map._idx[layer].byUid.get(uid));
    for (const r of removed) removePlacement(map, layer, r.uid);
    const added = { uid: map.nextUid++, b: block.id, x, y, w, h };
    addPlacement(map, layer, added);
    return { t: 'place', layer, removed, added: [added] };
  }

  function placeBlock(map, layer, block, x, y) {
    const op = placeOp(map, layer, block, x, y);
    return op ? { ops: [op] } : null;
  }

  function eraseAt(map, layer, x, y) {
    const p = placementAt(map, layer, x, y);
    if (!p) return null;
    removePlacement(map, layer, p.uid);
    return { ops: [{ t: 'place', layer, removed: [p], added: [] }] };
  }

  function fillRect(map, layer, block, x0, y0, x1, y1) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const ops = [];
    for (let y = ay; y + block.h - 1 <= by; y += block.h) {
      for (let x = ax; x + block.w - 1 <= bx; x += block.w) {
        const op = placeOp(map, layer, block, x, y);
        if (op) ops.push(op);
      }
    }
    return ops.length ? { ops } : null;
  }

  function eraseRect(map, layer, x0, y0, x1, y1) {
    const uids = uidsInRect(map, layer, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
    if (!uids.size) return null;
    const removed = [...uids].map((uid) => map._idx[layer].byUid.get(uid));
    for (const r of removed) removePlacement(map, layer, r.uid);
    return { ops: [{ t: 'place', layer, removed, added: [] }] };
  }

  function toggleStart(map, x, y) {
    if (!inBounds(map, x, y)) return null;
    const from = map.start ? { ...map.start } : null;
    const same = from && from.x === x && from.y === y;
    const to = same ? null : { x, y };
    map.start = to ? { ...to } : null;
    return { ops: [{ t: 'start', from, to }] };
  }

  function toggleExit(map, x, y) {
    if (!inBounds(map, x, y)) return null;
    const from = map.exits.map((e) => ({ ...e }));
    const has = from.some((e) => e.x === x && e.y === y);
    const to = has ? from.filter((e) => !(e.x === x && e.y === y)) : [...from, { x, y }];
    map.exits = to.map((e) => ({ ...e }));
    return { ops: [{ t: 'exits', from, to }] };
  }

  function applyOp(map, op) {
    if (op.t === 'place') {
      for (const r of op.removed) removePlacement(map, op.layer, r.uid);
      for (const a of op.added) addPlacement(map, op.layer, a);
    } else if (op.t === 'start') {
      map.start = op.to ? { ...op.to } : null;
    } else if (op.t === 'exits') {
      map.exits = op.to.map((e) => ({ ...e }));
    }
  }

  function revertOp(map, op) {
    if (op.t === 'place') {
      for (const a of op.added) removePlacement(map, op.layer, a.uid);
      for (const r of op.removed) addPlacement(map, op.layer, r);
    } else if (op.t === 'start') {
      map.start = op.from ? { ...op.from } : null;
    } else if (op.t === 'exits') {
      map.exits = op.from.map((e) => ({ ...e }));
    }
  }

  function applyPatch(map, patch) {
    for (const op of patch.ops) applyOp(map, op);
  }

  function revertPatch(map, patch) {
    for (let i = patch.ops.length - 1; i >= 0; i--) revertOp(map, patch.ops[i]);
  }

  function combinePatches(patches) {
    const ops = [];
    for (const p of patches) if (p) ops.push(...p.ops);
    return ops.length ? { ops } : null;
  }

  function isComplete(map) {
    return !!map.start && map.exits.length >= 1;
  }

  function fitsInside(p, width, height) {
    return p.x + p.w <= width && p.y + p.h <= height;
  }

  function countDroppedByResize(map, width, height) {
    let n = 0;
    for (const layer of LAYERS) for (const p of map.layers[layer]) if (!fitsInside(p, width, height)) n++;
    if (map.start && !(map.start.x < width && map.start.y < height)) n++;
    for (const e of map.exits) if (!(e.x < width && e.y < height)) n++;
    return n;
  }

  function resizeMap(map, width, height) {
    checkSize(width, height);
    const out = createMap({ id: map.id, name: map.name, width, height });
    for (const layer of LAYERS) {
      for (const p of map.layers[layer]) if (fitsInside(p, width, height)) addPlacement(out, layer, { ...p });
    }
    if (map.start && map.start.x < width && map.start.y < height) out.start = { ...map.start };
    out.exits = map.exits.filter((e) => e.x < width && e.y < height).map((e) => ({ ...e }));
    out.nextUid = Math.max(out.nextUid, map.nextUid);
    return out;
  }

  // 같은 맵 객체를 다른 크기의 새 내용으로 바꾼다 (크기 변경용)
  function replaceWith(map, next) {
    const rev = map._rev + 1;
    Object.assign(map, { width: next.width, height: next.height, layers: next.layers, start: next.start, exits: next.exits, nextUid: next.nextUid });
    map._idx = next._idx;
    map._rev = rev;
  }

  PR.MapModel = {
    LAYERS,
    MAX_SIZE,
    createMap,
    placeBlock,
    eraseAt,
    fillRect,
    eraseRect,
    toggleStart,
    toggleExit,
    applyPatch,
    revertPatch,
    combinePatches,
    placementAt,
    placementsInRect,
    revision,
    replaceWith,
    countPlacements,
    isComplete,
    resizeMap,
    countDroppedByResize,
  };
  if (typeof module !== 'undefined') module.exports = PR.MapModel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
