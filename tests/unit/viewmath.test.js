const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../js/viewmath.js');

test('fitView는 맵 전체를 마진을 두고 가운데에 넣는다', () => {
  const v = V.fitView(200, 200, 1000, 800);
  const size = 200 * 64 * v.scale;
  assert.ok(v.x >= 24 - 1e-6 && v.y >= 24 - 1e-6);
  assert.ok(v.x + size <= 1000 - 24 + 1e-6 && v.y + size <= 800 - 24 + 1e-6);
  assert.ok(Math.abs(v.x + size / 2 - 500) < 1e-6);
  assert.ok(Math.abs(v.y + size / 2 - 400) < 1e-6);
});

test('fitView는 작은 맵도 400%를 넘기지 않는다', () => {
  assert.equal(V.fitView(1, 1, 1000, 800).scale, 4);
});

test('zoomAt은 마우스 아래 지점을 고정하고 배율을 10%~400%로 제한한다', () => {
  let v = { scale: 1, x: 50, y: 20 };
  const before = V.screenToCell(v, 300, 200);
  const exactBefore = ((300 - v.x) / v.scale) / 64;
  for (let i = 0; i < 4; i++) v = V.zoomAt(v, 1.25, 300, 200);
  const exactAfter = ((300 - v.x) / v.scale) / 64;
  assert.ok(Math.abs(exactAfter - exactBefore) < 1e-9);
  assert.deepEqual(V.screenToCell(v, 300, 200), before);
  let lo = { scale: 1, x: 0, y: 0 };
  for (let i = 0; i < 10; i++) lo = V.zoomAt(lo, 0.01, 100, 100);
  assert.equal(lo.scale, V.MIN_SCALE);
  let hi = { scale: 1, x: 0, y: 0 };
  for (let i = 0; i < 10; i++) hi = V.zoomAt(hi, 100, 100, 100);
  assert.equal(hi.scale, V.MAX_SCALE);
});

test('panBy는 위치만 옮긴다', () => {
  assert.deepEqual(V.panBy({ scale: 2, x: 10, y: 10 }, -5, 7), { scale: 2, x: 5, y: 17 });
});

test('screenToCell은 칸 좌표를 내림으로 돌려주고 맵 밖도 그대로 돌려준다', () => {
  const v = { scale: 1, x: 0, y: 0 };
  assert.deepEqual(V.screenToCell(v, 64, 128), { x: 1, y: 2 });
  assert.deepEqual(V.screenToCell(v, 63, 127), { x: 0, y: 1 });
  assert.deepEqual(V.screenToCell(v, -1, 0), { x: -1, y: 0 });
  assert.deepEqual(V.screenToCell({ scale: 0.5, x: 100, y: 0 }, 100 + 32, 31), { x: 1, y: 0 });
});

test('visibleCellRange는 화면에 보이는 칸을 맵 범위 안으로 제한한다', () => {
  const r = V.visibleCellRange({ scale: 1, x: 0, y: 0 }, 800, 600, 40, 30);
  assert.deepEqual(r, { x0: 0, y0: 0, x1: 12, y1: 9 });
  const moved = V.visibleCellRange({ scale: 1, x: -64 * 100, y: 0 }, 800, 600, 40, 30);
  assert.ok(moved.x1 < moved.x0, '완전히 맵 밖이면 비어 있다');
  const wide = V.visibleCellRange({ scale: 0.1, x: 0, y: 0 }, 5000, 5000, 40, 30);
  assert.deepEqual(wide, { x0: 0, y0: 0, x1: 39, y1: 29 });
});
