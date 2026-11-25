const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, pageUrl, openEditor, count, pick, clickCell, dragCells } = require('./helpers.js');

let env;
test.beforeEach(async () => {
  env = await launch();
  env.page.setDefaultTimeout(5000);
});
test.afterEach(async () => {
  await env.browser.close();
});

const mapInfo = (page) => page.evaluate(() => {
  const m = window.__editor.getMap();
  return { w: m.width, h: m.height, start: m.start, exits: m.exits, n: m.layers.floor.length + m.layers.objects.length };
});

test('사각형 도구는 영역을 한 번에 채우고 되돌리기 한 번에 취소된다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  await env.page.click('[data-tool=rect]');
  await dragCells(env.page, 2, 2, 5, 4, { release: false });
  const sel = await env.page.evaluate(() => window.__editor.getSelection());
  assert.deepEqual(sel, { x0: 2, y0: 2, x1: 5, y1: 4 });
  assert.equal(await count(env.page), 0, '끄는 중에는 아직 놓이지 않는다');
  await env.page.mouse.up();
  assert.equal(await count(env.page), 12);
  assert.equal(await env.page.evaluate(() => window.__editor.getSelection()), null);
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 0);
  await pick(env.page, 'test_house');
  await env.page.click('[data-tool=rect]');
  await dragCells(env.page, 0, 0, 5, 3);
  assert.equal(await count(env.page), 4);
});

test('지우개를 끌면 한 번의 되돌리기로 복구되고, 시작·출구 표시는 지우지 않는다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  await dragCells(env.page, 2, 2, 6, 2);
  await env.page.click('[data-tool=start]');
  await clickCell(env.page, 4, 2);
  await env.page.click('[data-tool=erase]');
  await dragCells(env.page, 2, 2, 6, 2);
  const after = await mapInfo(env.page);
  assert.equal(after.n, 0);
  assert.deepEqual(after.start, { x: 4, y: 2 });
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 5);
});

test('시작 지점은 이동·제거, 출구는 추가·제거가 되고 되돌릴 수 있다', async () => {
  await openEditor(env.page);
  await env.page.click('[data-tool=start]');
  await clickCell(env.page, 1, 1);
  assert.deepEqual((await mapInfo(env.page)).start, { x: 1, y: 1 });
  await clickCell(env.page, 5, 5);
  assert.deepEqual((await mapInfo(env.page)).start, { x: 5, y: 5 });
  await clickCell(env.page, 5, 5);
  assert.equal((await mapInfo(env.page)).start, null);
  await env.page.click('[data-tool=exit]');
  await clickCell(env.page, 7, 7);
  await clickCell(env.page, 8, 8);
  assert.equal((await mapInfo(env.page)).exits.length, 2);
  await clickCell(env.page, 7, 7);
  assert.deepEqual((await mapInfo(env.page)).exits, [{ x: 8, y: 8 }]);
  await env.page.keyboard.press('Control+z');
  assert.equal((await mapInfo(env.page)).exits.length, 2);
});

test('시작과 출구를 모두 놓으면 목록에서 미완성 표시가 사라진다', async () => {
  await openEditor(env.page);
  await env.page.goto(pageUrl('index.html'));
  assert.equal(await env.page.locator('.badge-incomplete').count(), 1);
  await env.page.click('.map-card .btn-open');
  await env.page.waitForFunction(() => window.__editor && window.__editor.getMap());
  await env.page.click('[data-tool=start]');
  await clickCell(env.page, 1, 1);
  await env.page.click('[data-tool=exit]');
  await clickCell(env.page, 3, 3);
  await env.page.waitForFunction(() => document.getElementById('save-status').textContent.includes('저장됨'));
  await env.page.click('#btn-back');
  await env.page.waitForSelector('.map-card');
  assert.equal(await env.page.locator('.badge-incomplete').count(), 0);
});

test('격자 켜기/끄기 상태가 새로고침 뒤에도 유지된다', async () => {
  await openEditor(env.page);
  const active = () => env.page.evaluate(() => document.getElementById('btn-grid').classList.contains('active'));
  assert.equal(await active(), true);
  await env.page.click('#btn-grid');
  assert.equal(await active(), false);
  await env.page.reload();
  await env.page.waitForFunction(() => window.__editor && window.__editor.getMap());
  assert.equal(await active(), false);
});

test('크기를 줄여서 잘리는 블록이 있으면 개수를 알려주고 확인을 받는다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  await clickCell(env.page, 5, 5);
  await pick(env.page, 'test_crate');
  await clickCell(env.page, 39, 29);
  await pick(env.page, 'test_house');
  await clickCell(env.page, 37, 0);
  await env.page.click('#btn-resize');
  await env.page.fill('#resize-width', '20');
  await env.page.fill('#resize-height', '20');
  let message = '';
  env.page.once('dialog', (d) => { message = d.message(); d.dismiss(); });
  await env.page.click('#resize-ok');
  assert.match(message, /2/);
  assert.deepEqual([(await mapInfo(env.page)).w, (await mapInfo(env.page)).n], [40, 3]);
  env.page.once('dialog', (d) => d.accept());
  await env.page.click('#resize-ok');
  await env.page.waitForFunction(() => window.__editor.getMap().width === 20);
  const info = await mapInfo(env.page);
  assert.deepEqual([info.w, info.h, info.n], [20, 20, 1]);
  assert.equal(await env.page.locator('#btn-undo').isDisabled(), true);
  assert.equal(await env.page.locator('#resize-ok').count(), 0, '창이 닫힌다');
});

test('잘리는 것이 없으면 확인 없이 바로 바뀌고, 범위 밖 크기는 막힌다', async () => {
  await openEditor(env.page);
  let dialogs = 0;
  env.page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await env.page.click('#btn-resize');
  await env.page.fill('#resize-width', '0');
  await env.page.click('#resize-ok');
  assert.notEqual((await env.page.textContent('#resize-error')).trim(), '');
  await env.page.fill('#resize-width', '201');
  await env.page.click('#resize-ok');
  assert.equal((await mapInfo(env.page)).w, 40);
  await env.page.fill('#resize-width', '60');
  await env.page.fill('#resize-height', '45');
  await env.page.click('#resize-ok');
  await env.page.waitForFunction(() => window.__editor.getMap().width === 60);
  assert.equal((await mapInfo(env.page)).h, 45);
  assert.equal(dialogs, 0);
});
