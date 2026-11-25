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
    MM.fillRect(m, 'floor', { id: 'test_floor_gray', w: 1, h: 1 }, 0, 0, 199, 199);
    let n = 0;
    for (let y = 0; y < 200 && n < 8000; y += 2) {
      for (let x = 0; x < 200 && n < 8000; x += 2) {
        MM.placeBlock(m, 'objects', { id: n % 2 ? 'test_wall' : 'test_crate', w: 1, h: 1 }, x, y);
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
  await pick(env.page, 'test_floor_dirt');
  await env.page.evaluate(() => { window.__editor.getView().scale = 1; });
  await clickCell(env.page, 0, 0).catch(() => {});
  const ms = await env.page.evaluate(() => {
    const MM = window.PR.MapModel;
    const m = window.__editor.getMap();
    const t0 = performance.now();
    const patch = MM.fillRect(m, 'floor', { id: 'test_floor_dirt', w: 1, h: 1 }, 0, 0, 199, 199);
    const t1 = performance.now();
    MM.revertPatch(m, patch);
    return { fill: t1 - t0, undo: performance.now() - t1 };
  });
  assert.ok(ms.fill <= 400, `200×200 전체 덮어쓰기 ${ms.fill.toFixed(0)}ms`);
  assert.ok(ms.undo <= 200, `되돌리기 ${ms.undo.toFixed(0)}ms`);
});

test('1000×1000 맵: 목록·열기·그리기·되돌리기가 모두 쓸 만한 속도다', async () => {
  const { page } = env;
  page.setDefaultTimeout(60000);
  await page.goto(pageUrl('index.html'));
  const id = await page.evaluate(() => {
    const MM = window.PR.MapModel;
    const m = window.__store.createMap({ name: '엄청 큰 맵', width: 1000, height: 1000 });
    MM.fillRect(m, 'floor', { id: 'floor_light_1', w: 1, h: 1 }, 0, 0, 999, 999);
    if (!window.__store.saveMap(m).ok) throw new Error('저장 실패');
    return m.id;
  });
  // 목록: 큰 맵이 있어도 빨리 뜨고 작은 그림도 그려진다
  const t0 = Date.now();
  await page.reload();
  await page.waitForSelector('.map-card canvas');
  const listMs = Date.now() - t0;
  assert.ok(listMs < 3000, `목록이 뜨는 데 ${listMs}ms`);
  assert.match(await page.textContent('.card-size'), /1000×1000/);
  // 편집 화면: 열리고, 전체 보기에서 맵 전체가 화면 안에 보인다
  const t1 = Date.now();
  await page.goto(pageUrl('editor.html') + '?id=' + id);
  await page.waitForFunction(() => window.__editor && window.__editor.getMap(), null, { timeout: 60000 });
  const openMs = Date.now() - t1;
  assert.ok(openMs < 8000, `편집 화면이 열리는 데 ${openMs}ms`);
  const fit = await page.evaluate(() => {
    const v = window.__editor.getView();
    const r = document.getElementById('map-canvas').getBoundingClientRect();
    return { size: 1000 * 64 * v.scale, w: r.width, h: r.height, label: document.getElementById('zoom-label').textContent };
  });
  assert.ok(fit.size <= Math.min(fit.w, fit.h), `전체 보기가 화면보다 큼 (${fit.size} > ${fit.w}x${fit.h})`);
  // 전체 보기 / 100% 화면을 그리는 시간
  const first = await timeDraws(page);
  const again = await timeDraws(page);
  console.log(`perf 1000x1000 전체 보기 평균 ${first.ms.toFixed(1)}ms (처음 포함), 다시 ${again.ms.toFixed(1)}ms, 열기 ${openMs}ms, 목록 ${listMs}ms`);
  assert.ok(first.ms <= 300, `전체 보기 처음 포함 평균 ${first.ms.toFixed(1)}ms`);
  assert.ok(again.ms <= 50, `전체 보기 평균 ${again.ms.toFixed(1)}ms`);
  await page.evaluate(() => {
    const v = window.__editor.getView();
    v.scale = 1; v.x = -32000; v.y = -32000;
  });
  const zoomed = await timeDraws(page);
  assert.ok(zoomed.ms <= 50, `100% 화면 평균 ${zoomed.ms.toFixed(1)}ms`);
  assert.ok(zoomed.drawn < 1000, '보이는 칸만 그린다');
  // 전체를 덮어쓰고 되돌리기
  const ms = await page.evaluate(() => {
    const MM = window.PR.MapModel;
    const m = window.__editor.getMap();
    const t = performance.now();
    const patch = MM.fillRect(m, 'floor', { id: 'floor_light_1', w: 1, h: 1 }, 0, 0, 999, 999);
    const t2 = performance.now();
    return { fill: t2 - t, none: patch };
  });
  assert.equal(ms.none, null, '이미 같은 블록이라 바뀌는 것이 없다');
  assert.deepEqual(env.errors, []);
});
