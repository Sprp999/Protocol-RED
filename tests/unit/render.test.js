const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/blocks.js');
const M = require('../../js/mapmodel.js');
require('../../js/viewmath.js');
require('../../js/blocks.js');
const R = require('../../js/render.js');

// 아무 그리기 명령이나 받아 주고, 부드럽게 그리기 설정(imageSmoothingEnabled)이 마지막에 어떻게 되었는지만 기록하는 가짜 캔버스
function fakeCtx() {
  const ctx = { imageSmoothingEnabled: null };
  return new Proxy(ctx, {
    get: (t, k) => (k in t ? t[k] : () => {}),
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

test('작게 줄여 그릴 때는 부드럽게 그려서 점무늬가 생기지 않는다', () => {
  assert.equal(draw(0.125).smoothing, true);
  assert.equal(draw(0.3).smoothing, true);
});

test('크게 그릴 때는 픽셀이 번지지 않게 그린다', () => {
  assert.equal(draw(1).smoothing, false);
  assert.equal(draw(2).smoothing, false);
});

test('보이는 배치만 센다', () => {
  assert.equal(draw(1).drawn, 1);
});
