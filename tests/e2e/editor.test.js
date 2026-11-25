const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, pageUrl, cellToScreen, openEditor, count, pick, clickCell, dragCells } = require('./helpers.js');

let env;
test.beforeEach(async () => {
  env = await launch();
  env.page.setDefaultTimeout(5000);
});
test.afterEach(async () => {
  await env.browser.close();
});

test('열면 캔버스가 보이고 맵 전체가 화면 안에 들어온다', async () => {
  await openEditor(env.page);
  const info = await env.page.evaluate(() => {
    const c = document.getElementById('map-canvas');
    const v = window.__editor.getView();
    const w = c.getBoundingClientRect().width;
    return { cw: c.width, ch: c.height, label: document.getElementById('zoom-label').textContent, left: v.x, right: v.x + 40 * 64 * v.scale, w };
  });
  assert.ok(info.cw > 0 && info.ch > 0);
  assert.match(info.label, /^\d+%$/);
  assert.ok(info.left >= 0 && info.right <= info.w);
  assert.deepEqual(env.errors, []);
});

test('블록을 놓고 되돌리고 다시하고, 같은 칸에 다른 블록을 놓으면 대체된다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'tmp_floor_gray');
  await clickCell(env.page, 3, 3);
  assert.equal(await count(env.page), 1);
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 0);
  await env.page.keyboard.press('Control+y');
  assert.equal(await count(env.page), 1);
  await pick(env.page, 'tmp_floor_dirt');
  await clickCell(env.page, 3, 3);
  assert.equal(await count(env.page), 1);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.floor[0].b), 'tmp_floor_dirt');
  await env.page.click('#btn-undo');
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.floor[0].b), 'tmp_floor_gray');
});

test('끌어서 놓은 블록은 되돌리기 한 번에 모두 사라진다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'tmp_floor_gray');
  await dragCells(env.page, 2, 2, 6, 2);
  assert.equal(await count(env.page), 5);
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 0);
});

test('여러 칸 구조물은 가장자리에 걸치면 놓이지 않고, 다른 블록이 겹치면 통째로 대체된다', async () => {
  await openEditor(env.page);
  await env.page.click('[data-layer=objects]');
  await pick(env.page, 'tmp_house');
  await clickCell(env.page, 39, 0);
  assert.equal(await count(env.page), 0);
  await clickCell(env.page, 37, 0);
  assert.equal(await count(env.page), 1);
  await pick(env.page, 'tmp_crate');
  await clickCell(env.page, 38, 1);
  assert.equal(await count(env.page), 1);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.objects[0].b), 'tmp_crate');
});

test('층에 따라 팔레트가 바뀌고, 지우개는 선택한 층만 지운다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'tmp_floor_gray');
  await clickCell(env.page, 5, 5);
  await env.page.click('[data-layer=objects]');
  assert.equal(await env.page.locator('.palette-block[data-block-id="tmp_floor_gray"]').count(), 0);
  await pick(env.page, 'tmp_crate');
  await clickCell(env.page, 5, 5);
  assert.equal(await count(env.page), 2);
  await env.page.click('[data-tool=erase]');
  await clickCell(env.page, 5, 5);
  const left = await env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return [m.layers.floor.length, m.layers.objects.length];
  });
  assert.deepEqual(left, [1, 0]);
});

test('확대·축소 버튼은 400%와 4%에서 멈춘다', async () => {
  await openEditor(env.page);
  const label = () => env.page.textContent('#zoom-label');
  for (let i = 0; i < 40; i++) await env.page.click('#btn-zoom-in');
  assert.equal((await label()).trim(), '400%');
  for (let i = 0; i < 60; i++) await env.page.click('#btn-zoom-out');
  assert.equal((await label()).trim(), '4%');
  await env.page.click('#btn-fit');
  const fit = await env.page.evaluate(() => {
    const v = window.__editor.getView();
    return { left: v.x, right: v.x + 40 * 64 * v.scale, w: document.getElementById('map-canvas').getBoundingClientRect().width };
  });
  assert.ok(fit.left >= 0 && fit.right <= fit.w);
});

test('휠로 확대해도 마우스 아래 칸이 변하지 않는다', async () => {
  await openEditor(env.page);
  const p = await cellToScreen(env.page, 10, 10);
  const cellAt = () => env.page.evaluate(([px, py]) => {
    const rect = document.getElementById('map-canvas').getBoundingClientRect();
    return window.PR.ViewMath.screenToCell(window.__editor.getView(), px - rect.left, py - rect.top);
  }, [p.x, p.y]);
  const before = await cellAt();
  const scale0 = await env.page.evaluate(() => window.__editor.getView().scale);
  await env.page.mouse.move(p.x, p.y);
  await env.page.mouse.wheel(0, -400);
  await env.page.waitForFunction((s) => window.__editor.getView().scale > s, scale0);
  assert.deepEqual(await cellAt(), before);
});

test('스페이스를 누른 채 끌면 화면이 이동한다', async () => {
  await openEditor(env.page);
  const x0 = await env.page.evaluate(() => window.__editor.getView().x);
  await env.page.mouse.move(400, 400);
  await env.page.keyboard.down('Space');
  await env.page.mouse.down();
  await env.page.mouse.move(500, 430, { steps: 5 });
  await env.page.mouse.up();
  await env.page.keyboard.up('Space');
  const x1 = await env.page.evaluate(() => window.__editor.getView().x);
  assert.ok(Math.abs(x1 - x0 - 100) < 2, `x가 약 100 이동해야 함 (${x0} → ${x1})`);
  assert.equal(await count(env.page), 0, '이동 중에는 블록이 놓이지 않는다');
});

test('자동 저장되어 새로고침해도 블록이 남는다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'tmp_floor_gray');
  await clickCell(env.page, 4, 4);
  await env.page.waitForFunction(() => document.getElementById('save-status').textContent.includes('저장됨'));
  await env.page.reload();
  await env.page.waitForFunction(() => window.__editor && window.__editor.getMap());
  assert.equal(await count(env.page), 1);
});

test('저장 공간이 가득 차면 경고를 보이고 작업은 화면에 남는다', async () => {
  await openEditor(env.page);
  await env.page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException('가득', 'QuotaExceededError'); };
  });
  await pick(env.page, 'tmp_floor_gray');
  await clickCell(env.page, 4, 4);
  await env.page.waitForFunction(() => document.getElementById('save-status').textContent.includes('저장 실패'));
  assert.equal(await env.page.locator('#quota-banner').isVisible(), true);
  assert.equal(await count(env.page), 1);
});

test('없는 맵 번호는 안내가 보이고, 목록에 없는 블록이 있는 맵도 열린다', async () => {
  await env.page.goto(pageUrl('editor.html') + '?id=없음');
  await env.page.waitForSelector('#not-found');
  assert.equal(await env.page.locator('#not-found').isVisible(), true);
  await env.page.goto(pageUrl('index.html'));
  const id = await env.page.evaluate(() => {
    const m = window.__store.createMap({ name: '옛 맵', width: 10, height: 10 });
    const data = window.PR.MapFormat.serializeMap(m);
    data.objects = [['사라진블록', 3, 3, 1]];
    localStorage.setItem('pr.map.' + m.id, JSON.stringify(data));
    return m.id;
  });
  await env.page.goto(pageUrl('editor.html') + '?id=' + id);
  await env.page.waitForFunction(() => window.__editor && window.__editor.getMap());
  assert.equal(await count(env.page), 1);
  assert.deepEqual(env.errors, []);
});
