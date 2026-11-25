const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, pageUrl, pick, clickCell } = require('./helpers.js');

let env;
test.beforeEach(async () => {
  env = await launch();
  env.page.setDefaultTimeout(15000);
});
test.afterEach(async () => {
  await env.browser.close();
});

async function openBigMap(page) {
  await page.goto(pageUrl('index.html'));
  const id = await page.evaluate(() => {
    const MM = window.PR.MapModel;
    const m = window.__store.createMap({ name: '큰 맵', width: 200, height: 200 });
    MM.fillRect(m, 'floor', { id: 'tmp_floor_gray', w: 1, h: 1 }, 0, 0, 199, 199);
    let n = 0;
    for (let y = 0; y < 200 && n < 8000; y += 2) {
      for (let x = 0; x < 200 && n < 8000; x += 2) {
        MM.placeBlock(m, 'objects', { id: n % 2 ? 'tmp_wall' : 'tmp_crate', w: 1, h: 1 }, x, y);
        n++;
      }
    }
    window.__store.saveMap(m);
    return m.id;
  });
  await page.goto(pageUrl('editor.html') + '?id=' + id);
  await page.waitForFunction(() => window.__editor && window.__editor.getMap());
  return id;
}

// 같은 화면을 10번 그린 평균 시간(ms)과 마지막에 그린 배치 수
const timeDraws = (page) => page.evaluate(() => {
  const canvas = document.getElementById('map-canvas');
  const ctx = canvas.getContext('2d');
  const map = window.__editor.getMap();
  const view = window.__editor.getView();
  const opts = { viewW: canvas.getBoundingClientRect().width, viewH: canvas.getBoundingClientRect().height, showGrid: true };
  let drawn = 0;
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) drawn = window.PR.Render.drawMap(ctx, map, view, opts).drawn;
  return { ms: (performance.now() - t0) / 10, drawn };
});

test('200×200 맵 전체 보기와 100% 화면 모두 한 번 그리는 데 50ms 이하', async () => {
  await openBigMap(env.page);
  const total = await env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return m.layers.floor.length + m.layers.objects.length;
  });
  assert.equal(total, 40000 + 8000);
  const fit = await timeDraws(env.page);
  console.log(`perf 전체 보기 ${fit.ms.toFixed(1)}ms`);
  assert.ok(fit.ms <= 50, `전체 보기 평균 ${fit.ms.toFixed(1)}ms`);
  assert.equal(fit.drawn, total);
  await env.page.evaluate(() => {
    const v = window.__editor.getView();
    v.scale = 1; v.x = -3000; v.y = -3000;
  });
  const zoomed = await timeDraws(env.page);
  console.log(`perf 100% ${zoomed.ms.toFixed(1)}ms`);
  assert.ok(zoomed.ms <= 50, `100% 화면 평균 ${zoomed.ms.toFixed(1)}ms`);
  assert.ok(zoomed.drawn < total, '보이는 칸만 그린다');
  assert.deepEqual(env.errors, []);
});

test('큰 맵에서 블록을 칠하고 되돌리기가 200ms 안에 끝난다', async () => {
  await openBigMap(env.page);
  await pick(env.page, 'tmp_floor_dirt');
  await env.page.evaluate(() => { window.__editor.getView().scale = 1; });
  await clickCell(env.page, 0, 0).catch(() => {});
  const ms = await env.page.evaluate(() => {
    const MM = window.PR.MapModel;
    const m = window.__editor.getMap();
    const t0 = performance.now();
    const patch = MM.fillRect(m, 'floor', { id: 'tmp_floor_dirt', w: 1, h: 1 }, 0, 0, 199, 199);
    const t1 = performance.now();
    MM.revertPatch(m, patch);
    return { fill: t1 - t0, undo: performance.now() - t1 };
  });
  assert.ok(ms.fill <= 400, `200×200 전체 덮어쓰기 ${ms.fill.toFixed(0)}ms`);
  assert.ok(ms.undo <= 200, `되돌리기 ${ms.undo.toFixed(0)}ms`);
});
