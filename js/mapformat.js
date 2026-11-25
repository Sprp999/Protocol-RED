(function (root) {
  const PR = (root.PR = root.PR || {});

  class MapFormatError extends Error {
    constructor(message) {
      super(message);
      this.name = 'MapFormatError';
    }
  }

  function serializeLayer(placements) {
    const sorted = [...placements].sort((a, b) => a.y - b.y || a.x - b.x);
    const out = [];
    let run = null;
    for (const p of sorted) {
      if (run && run.b === p.b && run.y === p.y && run.w === p.w && run.h === p.h && p.x === run.x + run.n * run.w) {
        run.n++;
      } else {
        run = { b: p.b, x: p.x, y: p.y, w: p.w, h: p.h, n: 1 };
        out.push(run);
      }
    }
    return out.map((r) => [r.b, r.x, r.y, r.n]);
  }

  function serializeMap(map) {
    return {
      version: 1,
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      tileSize: map.tileSize,
      floor: serializeLayer(map.layers.floor),
      objects: serializeLayer(map.layers.objects),
      start: map.start ? { x: map.start.x, y: map.start.y } : null,
      exits: map.exits.map((e) => ({ x: e.x, y: e.y })),
    };
  }

  const isInt = (v) => Number.isInteger(v);

  function checkPoint(pt, width, height, label) {
    if (!pt || typeof pt !== 'object' || !isInt(pt.x) || !isInt(pt.y) || pt.x < 0 || pt.y < 0 || pt.x >= width || pt.y >= height) {
      throw new MapFormatError(label + ' 위치가 올바르지 않아요.');
    }
    return { x: pt.x, y: pt.y };
  }

  function parseMap(data, sizeOf) {
    const MM = root.PR.MapModel;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new MapFormatError('맵 파일 형식이 아니에요.');
    }
    if (data.version !== 1) {
      throw new MapFormatError('지원하지 않는 맵 파일 버전이에요: ' + String(data.version));
    }
    if (typeof data.id !== 'string' || !data.id || typeof data.name !== 'string') {
      throw new MapFormatError('맵의 번호표(id)나 이름이 없어요.');
    }
    let map;
    try {
      map = MM.createMap({ id: data.id, name: data.name, width: data.width, height: data.height });
    } catch (e) {
      throw new MapFormatError('맵 크기가 올바르지 않아요. (1~' + MM.MAX_SIZE + ' 사이의 정수)');
    }
    for (const [layer, label] of [['floor', '바닥'], ['objects', '물건']]) {
      const list = data[layer];
      if (!Array.isArray(list)) throw new MapFormatError(label + ' 층 정보가 없어요.');
      for (const entry of list) {
        if (!Array.isArray(entry) || entry.length !== 4 || typeof entry[0] !== 'string' ||
            !isInt(entry[1]) || !isInt(entry[2]) || !isInt(entry[3]) ||
            entry[1] < 0 || entry[2] < 0 || entry[3] < 1) {
          throw new MapFormatError(label + ' 층에 올바르지 않은 항목이 있어요.');
        }
        const [b, x, y, n] = entry;
        const size = (sizeOf && sizeOf(b)) || { w: 1, h: 1 };
        if (x + n * size.w > map.width || y + size.h > map.height) {
          throw new MapFormatError(label + ' 층에 맵 밖으로 나가는 항목이 있어요.');
        }
        for (let i = 0; i < n; i++) MM.placeBlock(map, layer, { id: b, w: size.w, h: size.h }, x + i * size.w, y);
      }
    }
    if (data.start !== null && data.start !== undefined) {
      map.start = checkPoint(data.start, map.width, map.height, '시작 지점');
    }
    if (!Array.isArray(data.exits)) throw new MapFormatError('출구 정보가 올바르지 않아요.');
    map.exits = data.exits.map((e) => checkPoint(e, map.width, map.height, '출구'));
    return map;
  }

  PR.MapFormat = { serializeMap, parseMap, MapFormatError };
  if (typeof module !== 'undefined') module.exports = PR.MapFormat;
})(typeof globalThis !== 'undefined' ? globalThis : window);
