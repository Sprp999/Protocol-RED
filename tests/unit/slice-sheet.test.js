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
