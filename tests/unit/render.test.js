const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/blocks.js');
const M = require('../../js/mapmodel.js');
require('../../js/viewmath.js');
const B = require('../../js/blocks.js');
const R = require('../../js/render.js');

// 아무 그리기 명령이나 받아 주고, 부드럽게 그리기 설정(imageSmoothingEnabled)이 마지막에 어떻게 되었는지만 기록하는 가짜 캔버스
function fakeCtx(fills) {
  const ctx = { imageSmoothingEnabled: null };
  return new Proxy(ctx, {
    get: (t, k) => {
      if (k === 'fillRect') return () => { if (fills) fills.push(t.fillStyle); };
      return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const map = () => {
  const m = M.createMap({ id: 'r', name: 'r', width: 20, height: 20 });
  M.placeBlock(m, 'floor', { id: 'floor_light_1', w: 1, h: 1 }, 1, 1);
  return m;
};
const draw = (scale) => {
  const ctx = fakeCtx();
  const res = R.drawMap(ctx, map(), { scale, x: 0, y: 0 }, { viewW: 800, viewH: 600, showGrid: false });
  return { smoothing: ctx.imageSmoothingEnabled, drawn: res.drawn };
};

// 그림을 실제로 그릴 때(drawImage)의 부드럽게 그리기 설정과 쓴 그림을 기록하는 가짜 캔버스
function imageCtx() {
  const drawn = [];
  const ctx = new Proxy({ imageSmoothingEnabled: null }, {
    get: (t, k) => (k === 'drawImage' ? (img, ...a) => drawn.push({ img, smooth: t.imageSmoothingEnabled, w: a[2] }) : k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, drawn };
}
const drawWithImage = (img, scale) => {
  B.setImage('floor_light_1', img);
  const { ctx, drawn } = imageCtx();
  R.drawMap(ctx, map(), { scale, x: 0, y: 0 }, { viewW: 800, viewH: 600, showGrid: false });
  return drawn;
};

test('큰 원본 그림을 작게 줄여 그릴 때는 부드럽게 그린다 (깨지고 점무늬가 생기지 않게)', () => {
  for (const scale of [0.2, 0.5, 1, 2]) {
    const drawn = drawWithImage({ width: 1254, height: 1254 }, scale);
    assert.equal(drawn.length, 1, `scale ${scale}`);
    assert.equal(drawn[0].smooth, true, `scale ${scale}`);
  }
});

test('작은 그림을 크게 늘려 그릴 때는 픽셀이 번지지 않게 그린다', () => {
  const drawn = drawWithImage({ width: 64, height: 64 }, 2);
  assert.equal(drawn[0].smooth, false);
  assert.equal(drawn[0].w, 128);
});

test('보이는 배치만 센다', () => {
  assert.equal(draw(1).drawn, 1);
});

test('아무것도 놓지 않은 맵은 배경과 같은 검은색만 칠한다', () => {
  const fills = [];
  const empty = M.createMap({ id: 'e', name: 'e', width: 10, height: 10 });
  R.drawMap(fakeCtx(fills), empty, { scale: 1, x: 0, y: 0 }, { viewW: 800, viewH: 600, showGrid: false });
  assert.ok(fills.length >= 1);
  assert.deepEqual([...new Set(fills)], ['#000']);
});

test('시작·출구 정보가 들어 있어도 맵 위에 표시를 그리지 않는다', () => {
  const fills = [];
  const m = M.createMap({ id: 'e', name: 'e', width: 10, height: 10 });
  M.toggleStart(m, 1, 1);
  M.toggleExit(m, 5, 5);
  R.drawMap(fakeCtx(fills), m, { scale: 1, x: 0, y: 0 }, { viewW: 800, viewH: 600, showGrid: false });
  assert.deepEqual([...new Set(fills)], ['#000']);
});

// 아주 작게 줄여 볼 때는 칸마다 그리지 않고, 맵 전체를 한 장의 작은 그림으로 만들어 늘려 붙인다
function withFakeDocument(fn) {
  const made = [];
  const saved = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0, puts: 0, getContext: () => ({
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData(img) { cv.puts++; cv.image = img; },
      }) };
      made.push(cv);
      return cv;
    },
  };
  try { return fn(made); } finally { globalThis.document = saved; }
}
function countingCtx() {
  const calls = { fillRect: 0, drawImage: 0 };
  const ctx = new Proxy({ imageSmoothingEnabled: null }, {
    get: (t, k) => {
      if (k === 'fillRect') return () => { calls.fillRect++; };
      if (k === 'drawImage') return () => { calls.drawImage++; };
      return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, calls };
}

test('작게 줄여 볼 때는 칸마다 그리지 않고 한 장으로 그린다', () => withFakeDocument((made) => {
  const m = M.createMap({ id: 'big', name: 'big', width: 1000, height: 1000 });
  M.fillRect(m, 'floor', { id: 'floor_light_1', w: 1, h: 1 }, 0, 0, 999, 999);
  const { ctx, calls } = countingCtx();
  const t0 = Date.now();
  const res = R.drawMap(ctx, m, { scale: 0.014, x: 20, y: 20 }, { viewW: 1000, viewH: 700, showGrid: false });
  assert.ok(Date.now() - t0 < 3000);
  assert.ok(calls.fillRect < 20, `칸마다 그리고 있어요 (${calls.fillRect}번)`);
  assert.equal(calls.drawImage, 1);
  assert.equal(res.drawn, 1000000);
  assert.equal(made.length, 1);
  assert.equal(made[0].width, 1000);
  assert.equal(made[0].height, 1000);
  const px = made[0].image.data;
  const c = parseInt('e5e8ee', 16);
  assert.deepEqual([px[0], px[1], px[2], px[3]], [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
  // 같은 맵을 다시 그리면 그림을 새로 만들지 않는다
  R.drawMap(ctx, m, { scale: 0.014, x: 20, y: 20 }, { viewW: 1000, viewH: 700, showGrid: false });
  assert.equal(made.length, 1);
  assert.equal(made[0].puts, 1);
  // 맵이 바뀌면 다시 만든다
  M.eraseAt(m, 'floor', 0, 0);
  R.drawMap(ctx, m, { scale: 0.014, x: 20, y: 20 }, { viewW: 1000, viewH: 700, showGrid: false });
  assert.equal(made[0].puts, 2);
  assert.equal(made[0].image.data[3], 0, '지운 칸은 투명(배경 검정)');
}));

test('크게 볼 때는 화면에 보이는 칸만 그린다', () => {
  const m = M.createMap({ id: 'big', name: 'big', width: 1000, height: 1000 });
  M.fillRect(m, 'floor', { id: 'floor_light_1', w: 1, h: 1 }, 0, 0, 999, 999);
  const { ctx } = countingCtx();
  const res = R.drawMap(ctx, m, { scale: 1, x: -64 * 500, y: -64 * 500 }, { viewW: 1280, viewH: 640, showGrid: false });
  assert.ok(res.drawn > 0 && res.drawn <= 22 * 11, `보이는 칸 수 ${res.drawn}`);
});

test('썸네일은 저장된 데이터에서 줄(런) 단위로만 그려서 아주 큰 맵도 빠르다', () => {
  const data = { version: 1, id: 'a', name: 'a', width: 1000, height: 1000, floor: [], objects: [], start: null, exits: [] };
  for (let y = 0; y < 1000; y++) data.floor.push(['floor_light_1', 0, y, 1000]);
  data.objects.push(['없는블록', 3, 3, 2]);
  const { ctx, calls } = countingCtx();
  const canvas = { width: 240, height: 160, getContext: () => ctx };
  const t0 = Date.now();
  R.drawThumbnailData(canvas, data);
  assert.ok(Date.now() - t0 < 500);
  assert.ok(calls.fillRect >= 1000 && calls.fillRect < 1100, `fillRect ${calls.fillRect}번`);
});

test('그리는 순서는 바닥 → 벽 → 물건이라서 물건이 벽 앞에 보인다', () => {
  const m = M.createMap({ id: 'o', name: 'o', width: 10, height: 10 });
  M.placeBlock(m, 'objects', { id: 'o_img', w: 1, h: 1 }, 3, 3);
  M.placeBlock(m, 'walls', { id: 'w_img', w: 1, h: 1 }, 3, 3);
  M.placeBlock(m, 'floor', { id: 'f_img', w: 1, h: 1 }, 3, 3);
  const imgs = {};
  for (const id of ['f_img', 'w_img', 'o_img']) {
    imgs[id] = { width: 64, height: 64, tag: id };
    B.setImage(id, imgs[id]);
  }
  const saved = globalThis.PR.BLOCK_DEFS;
  const def = (id, layer) => ({ id, name: id, layer, category: 'x', w: 1, h: 1, solid: false, color: '#123456' });
  globalThis.PR.BLOCK_DEFS = [def('f_img', 'floor'), def('w_img', 'walls'), def('o_img', 'objects')];
  try {
    const { ctx, drawn } = imageCtx();
    R.drawMap(ctx, m, { scale: 1, x: 0, y: 0 }, { viewW: 800, viewH: 600, showGrid: false });
    assert.deepEqual(drawn.map((d) => d.img.tag), ['f_img', 'w_img', 'o_img']);
  } finally {
    globalThis.PR.BLOCK_DEFS = saved;
  }
});

test('벽 층도 한 장 그림(작게 볼 때)과 썸네일에 포함된다', () => withFakeDocument((made) => {
  const saved = globalThis.PR.BLOCK_DEFS;
  globalThis.PR.BLOCK_DEFS = [{ id: 'w_col', name: 'w', layer: 'walls', category: 'x', w: 1, h: 1, solid: true, color: '#ff0000' }];
  try {
    const m = M.createMap({ id: 'w', name: 'w', width: 100, height: 100 });
    M.placeBlock(m, 'walls', { id: 'w_col', w: 1, h: 1 }, 0, 0);
    const { ctx } = countingCtx();
    R.drawMap(ctx, m, { scale: 0.02, x: 0, y: 0 }, { viewW: 800, viewH: 600, showGrid: false });
    const px = made[0].image.data;
    assert.deepEqual([px[0], px[1], px[2], px[3]], [255, 0, 0, 255]);
    const data = { version: 1, width: 100, height: 100, floor: [], walls: [['w_col', 0, 0, 5]], objects: [] };
    const c = countingCtx();
    R.drawThumbnailData({ width: 240, height: 160, getContext: () => c.ctx }, data);
    assert.ok(c.calls.fillRect >= 3, '벽도 그린다 (배경 2번 + 벽 1번 이상)');
  } finally {
    globalThis.PR.BLOCK_DEFS = saved;
  }
}));
