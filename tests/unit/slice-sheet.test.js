const test = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const T = require('../../tools/slice-sheet.js');

// 칸 단위로 색을 정해 PNG를 만든다. fills[i] = [r,g,b,a] (가로 방향 순서)
function makePng(width, height, paint) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
    }
  }
  return png;
}
const clear = [0, 0, 0, 0];

test('sliceSheet는 칸 단위로 자르고 투명한 칸은 empty, 색은 평균색', () => {
  const sheet = makePng(128, 64, (x) => (x < 64 ? [255, 0, 0, 255] : clear));
  const tiles = T.sliceSheet(sheet, 64);
  assert.equal(tiles.length, 2);
  assert.deepEqual([tiles[0].col, tiles[0].row, tiles[0].empty, tiles[0].color], [0, 0, false, '#ff0000']);
  assert.deepEqual([tiles[1].col, tiles[1].row, tiles[1].empty], [1, 0, true]);
  assert.equal(tiles[0].png.width, 64);
  assert.equal(tiles[0].png.height, 64);
});

test('sliceSheet는 아래 줄도 왼쪽 위부터 가로 방향 순서로 돌려준다', () => {
  const sheet = makePng(128, 128, (x, y) => (x >= 64 && y >= 64 ? [0, 0, 255, 255] : clear));
  const tiles = T.sliceSheet(sheet, 64);
  assert.deepEqual(tiles.map((t) => [t.col, t.row]), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.deepEqual(tiles.map((t) => t.empty), [true, true, true, false]);
  assert.equal(tiles[3].color, '#0000ff');
});

test('checkImage는 크기가 64의 배수가 아니면 알려준다', () => {
  const warnings = T.checkImage(makePng(100, 64, () => clear), 64);
  assert.ok(warnings.some((w) => w.includes('64의 배수')));
  assert.deepEqual(T.checkImage(makePng(128, 64, (x, y) => (x === 10 && y === 10 ? [1, 2, 3, 255] : clear)), 64), []);
});

test('checkImage는 모서리가 모두 불투명이면 배경 확인 경고를 낸다', () => {
  const white = makePng(64, 64, () => [255, 255, 255, 255]);
  assert.ok(T.checkImage(white, 64).some((w) => w.includes('배경')));
  const edge = makePng(64, 64, (x, y) => (x === 0 && y === 0 ? clear : [255, 255, 255, 255]));
  assert.equal(T.checkImage(edge, 64).some((w) => w.includes('배경')), false);
});

test('checkImage는 전부 투명한 그림도 알려준다', () => {
  assert.ok(T.checkImage(makePng(64, 64, () => clear), 64).some((w) => w.includes('투명')));
});

test('wholeEntry는 큰 구조물을 칸 수로 환산한 항목 하나로 만든다', () => {
  const house = makePng(192, 128, () => [10, 200, 10, 255]);
  const entry = T.wholeEntry(house, 64, { id: 'house_1', name: '집', layer: 'objects', category: '건물', solid: true, file: 'assets/blocks/house_1.png' });
  assert.deepEqual([entry.w, entry.h, entry.id, entry.color], [3, 2, 'house_1', '#0ac80a']);
  assert.equal(entry.layer, 'objects');
  assert.equal(entry.file, 'assets/blocks/house_1.png');
});

test('wholeEntry는 size를 직접 주면 그림이 아무리 커도 그 칸 수로 등록한다', () => {
  const capsule = makePng(887, 1774, () => [10, 200, 10, 255]);
  const entry = T.wholeEntry(capsule, 64, { id: 'c', name: '캡슐', layer: 'objects', category: '물건', solid: true, file: 'assets/blocks/c.png', size: { w: 1, h: 2 } });
  assert.deepEqual([entry.w, entry.h], [1, 2]);
});

test('checkImage는 칸 수를 알려주면 비율이 맞는지만 보고, 큰 그림의 64 배수 경고는 내지 않는다', () => {
  const ok = makePng(887, 1774, (x, y) => (x === 5 && y === 5 ? [1, 2, 3, 255] : clear));
  assert.deepEqual(T.checkImage(ok, 64, { w: 1, h: 2 }), []);
  const wrong = makePng(887, 1000, (x, y) => (x === 5 && y === 5 ? [1, 2, 3, 255] : clear));
  assert.ok(T.checkImage(wrong, 64, { w: 1, h: 2 }).some((w) => w.includes('비율')));
  const small = makePng(40, 80, (x, y) => (x === 5 && y === 5 ? [1, 2, 3, 255] : clear));
  assert.ok(T.checkImage(small, 64, { w: 1, h: 2 }).some((w) => w.includes('작')), '한 칸 64픽셀보다 작으면 알려준다');
});

// ---- 애니메이션 시트(여러 프레임이 격자로 모인 그림) 검사 ----
// 64×64 프레임 4×4 시트. 프레임 k 의 안쪽은 levelOf(k) 밝기로 채워지고, 프레임 둘레 1픽셀은 투명하다(gap).
const sine = (k) => Math.round(128 + 100 * Math.sin((2 * Math.PI * k) / 16)); // 한 바퀴 돌아 처음과 이어지는 움직임
function brightSheet({ levelOf = sine, copyFrom = null, gap = true } = {}) {
  const fw = 64, fh = 64, cols = 4, rows = 4;
  return makePng(cols * fw, rows * fh, (x, y) => {
    const k = Math.floor(y / fh) * cols + Math.floor(x / fw);
    const lx = x % fw, ly = y % fh;
    if (gap && (lx === 0 || ly === 0 || lx === fw - 1 || ly === fh - 1)) return clear;
    const g = levelOf(copyFrom && copyFrom[k] !== undefined ? copyFrom[k] : k);
    return [g, g, g, 255];
  });
}

test('checkAnimSheet: 고르게 움직이고 처음으로 매끄럽게 돌아오는 시트는 경고가 없다', () => {
  const r = T.checkAnimSheet(brightSheet(), { cols: 4, rows: 4, size: { w: 1, h: 1 } });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.stats.consecutive.length, 16, '프레임 사이 차이를 16개(마지막→처음 포함) 잰다');
});

test('checkAnimSheet: 같은 그림이 이어지는 프레임이 있으면 알려준다', () => {
  const copy = {}; for (let i = 0; i < 16; i++) copy[i] = i; copy[5] = 4;
  const r = T.checkAnimSheet(brightSheet({ copyFrom: copy }), { cols: 4, rows: 4, size: { w: 1, h: 1 } });
  assert.ok(r.warnings.some((w) => w.includes('같은 그림')));
});

test('checkAnimSheet: 마지막 프레임에서 처음으로 돌아올 때 튀면 알려준다', () => {
  const r = T.checkAnimSheet(brightSheet({ levelOf: (k) => k * 16 }), { cols: 4, rows: 4, size: { w: 1, h: 1 } });
  assert.ok(r.warnings.some((w) => w.includes('처음으로 돌아')));
});

test('checkAnimSheet: 시트 크기가 격자로 나누어떨어지지 않으면 알려준다', () => {
  const r = T.checkAnimSheet(makePng(250, 250, () => [10, 10, 10, 255]), { cols: 4, rows: 4, size: { w: 1, h: 1 } });
  assert.ok(r.warnings.some((w) => w.includes('나누어떨어지지')));
});

test('checkAnimSheet: 프레임 사이에 투명한 간격이 없으면 격자가 분명한지 확인하라고 알려준다', () => {
  const r = T.checkAnimSheet(brightSheet({ gap: false }), { cols: 4, rows: 4, size: { w: 1, h: 1 } });
  assert.ok(r.warnings.some((w) => w.includes('간격')));
});

test('checkAnimSheet: 프레임 한 장이 칸 비율과 다르거나 너무 작으면 알려준다', () => {
  const r = T.checkAnimSheet(brightSheet(), { cols: 4, rows: 4, size: { w: 1, h: 2 } });
  assert.ok(r.warnings.some((w) => w.includes('비율')));
  const small = makePng(32, 32, () => clear);
  assert.ok(T.checkAnimSheet(small, { cols: 4, rows: 4, size: { w: 1, h: 1 } }).warnings.some((w) => w.includes('작')));
});

test('wholeEntry는 애니메이션 정보(프레임 수·격자·초당 프레임)를 항목에 담는다', () => {
  const entry = T.wholeEntry(brightSheet(), 64, {
    id: 'fan', name: '환풍기', layer: 'walldeco', category: '벽꾸미기', solid: false, file: 'assets/blocks/fan.png',
    size: { w: 1, h: 1 }, anim: { cols: 4, rows: 4, fps: 16 },
  });
  assert.deepEqual(entry.anim, { frames: 16, cols: 4, rows: 4, fps: 16 });
  assert.deepEqual([entry.w, entry.h], [1, 1]);
});
