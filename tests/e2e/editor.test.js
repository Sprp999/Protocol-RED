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
    const rect = c.getBoundingClientRect();
    const side = document.querySelector('.sidebar');
    const bar = document.querySelector('.zoombar').getBoundingClientRect();
    return {
      cw: c.width, ch: c.height, label: document.getElementById('zoom-label').textContent,
      left: v.x, right: v.x + 40 * 64 * v.scale, w,
      top: v.y, bottom: v.y + 30 * 64 * v.scale, h: rect.height,
      sideOverflow: side.scrollWidth > side.clientWidth,
      barOverlapsCanvas: bar.top < rect.bottom - 1 && bar.bottom > rect.top && bar.left < rect.right && bar.right > rect.left,
    };
  });
  assert.ok(info.cw > 0 && info.ch > 0);
  assert.match(info.label, /^\d+%$/);
  assert.ok(info.left >= 0 && info.right <= info.w);
  assert.ok(info.top >= 0 && info.bottom <= info.h, '맵 아래쪽도 화면 안에 들어온다');
  assert.equal(info.barOverlapsCanvas, false, '확대 막대가 맵 위를 가리지 않는다');
  assert.equal(info.sideOverflow, false, '왼쪽 블록 목록이 옆으로 삐져나가지 않는다');
  assert.deepEqual(env.errors, []);
});

test('블록을 놓고 되돌리고 다시하고, 같은 칸에 다른 블록을 놓으면 대체된다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  await clickCell(env.page, 3, 3);
  assert.equal(await count(env.page), 1);
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 0);
  await env.page.keyboard.press('Control+y');
  assert.equal(await count(env.page), 1);
  await pick(env.page, 'test_floor_dirt');
  await clickCell(env.page, 3, 3);
  assert.equal(await count(env.page), 1);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.floor[0].b), 'test_floor_dirt');
  await env.page.click('#btn-undo');
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.floor[0].b), 'test_floor_gray');
});

test('끌어서 놓은 블록은 되돌리기 한 번에 모두 사라진다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  await dragCells(env.page, 2, 2, 6, 2);
  assert.equal(await count(env.page), 5);
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 0);
});

test('여러 칸 구조물은 가장자리에 걸치면 놓이지 않고, 다른 블록이 겹치면 통째로 대체된다', async () => {
  await openEditor(env.page);
  await env.page.click('[data-layer=objects]');
  await pick(env.page, 'test_house');
  await clickCell(env.page, 39, 0);
  assert.equal(await count(env.page), 0);
  await clickCell(env.page, 37, 0);
  assert.equal(await count(env.page), 1);
  await pick(env.page, 'test_crate');
  await clickCell(env.page, 38, 1);
  assert.equal(await count(env.page), 1);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.objects[0].b), 'test_crate');
});

test('층에 따라 팔레트가 바뀌고, 지우개는 맨 위 블록부터 지운다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  await clickCell(env.page, 5, 5);
  await env.page.click('[data-layer=objects]');
  assert.equal(await env.page.locator('.palette-block[data-block-id="test_floor_gray"]').count(), 0);
  await pick(env.page, 'test_crate');
  await clickCell(env.page, 5, 5);
  assert.equal(await count(env.page), 2);
  await env.page.click('[data-tool=erase]');
  await clickCell(env.page, 5, 5);
  const left = await env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return [m.layers.floor.length, m.layers.objects.length];
  });
  assert.deepEqual(left, [1, 0]);
  await clickCell(env.page, 5, 5);
  assert.equal(await count(env.page), 0, '다시 누르면 아래 바닥도 지워진다');
});

test('확대·축소 버튼은 400%와 1%에서 멈춘다', async () => {
  await openEditor(env.page);
  const label = () => env.page.textContent('#zoom-label');
  for (let i = 0; i < 40; i++) await env.page.click('#btn-zoom-in');
  assert.equal((await label()).trim(), '400%');
  for (let i = 0; i < 60; i++) await env.page.click('#btn-zoom-out');
  assert.equal((await label()).trim(), '1%');
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
  await pick(env.page, 'test_floor_gray');
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
  await pick(env.page, 'test_floor_gray');
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

test('그림이 있는 블록은 팔레트와 맵에 그림으로 보인다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'floor_light_1');
  const sw = await env.page.evaluate(() => {
    const img = document.querySelector('.palette-block[data-block-id="floor_light_1"] img');
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  assert.deepEqual(sw, { w: 1254, h: 1254 }, '원본 그림 그대로 쓴다');
  await clickCell(env.page, 3, 3);
  const loaded = await env.page.evaluate(() => {
    const img = window.PR.Blocks.image('floor_light_1');
    return img ? img.naturalWidth : 0;
  });
  assert.equal(loaded, 1254);
  assert.equal(await count(env.page), 1);
  assert.deepEqual(env.errors, []);
});

test('마우스 오른쪽 버튼을 누르고 끌면 블록은 놓이지 않고 화면만 이동한다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_floor_gray');
  const before = await env.page.evaluate(() => ({ x: window.__editor.getView().x, y: window.__editor.getView().y }));
  await env.page.mouse.move(500, 300);
  await env.page.mouse.down({ button: 'right' });
  await env.page.mouse.move(580, 350, { steps: 6 });
  await env.page.mouse.up({ button: 'right' });
  const after = await env.page.evaluate(() => ({ x: window.__editor.getView().x, y: window.__editor.getView().y }));
  assert.ok(Math.abs(after.x - before.x - 80) < 2, `x가 약 80 이동해야 함 (${before.x} → ${after.x})`);
  assert.ok(Math.abs(after.y - before.y - 50) < 2, `y가 약 50 이동해야 함 (${before.y} → ${after.y})`);
  assert.equal(await count(env.page), 0, '오른쪽 버튼으로는 블록이 놓이지 않는다');
  assert.equal(await env.page.locator('#btn-undo').isDisabled(), true, '되돌리기 기록도 생기지 않는다');
  // 이동 뒤에는 왼쪽 버튼으로 정상적으로 놓인다
  await clickCell(env.page, 3, 3);
  assert.equal(await count(env.page), 1);
});

test('블록이 하나도 없는 층은 안내 문구를 보이고 오류 없이 동작한다', async () => {
  const floorOnly = require('../../data/blocks.js').filter((b) => b.layer === 'floor');
  const bare = await launch({ defs: floorOnly });
  try {
    bare.page.setDefaultTimeout(5000);
    await openEditor(bare.page);
    await bare.page.click('[data-layer=objects]');
    assert.equal(await bare.page.locator('#palette-empty').isVisible(), true);
    assert.equal(await bare.page.locator('.palette-block').count(), 0);
    await clickCell(bare.page, 3, 3);
    assert.equal(await count(bare.page), 0, '고른 블록이 없으면 아무것도 놓이지 않는다');
    await bare.page.click('[data-layer=floor]');
    assert.equal(await bare.page.locator('#palette-empty').count(), 0);
    assert.ok(await bare.page.locator('.palette-block').count() >= 1);
    assert.deepEqual(bare.errors, []);
  } finally {
    await bare.browser.close();
  }
});

test('시작·출구 도구는 화면에 없고, 새 맵은 아무것도 없이 시작한다', async () => {
  await openEditor(env.page);
  assert.equal(await env.page.locator('[data-tool=start]').count(), 0);
  assert.equal(await env.page.locator('[data-tool=exit]').count(), 0);
  assert.equal(await count(env.page), 0);
  const tools = await env.page.locator('[data-tool]').evaluateAll((els) => els.map((e) => e.dataset.tool));
  assert.deepEqual(tools, ['brush', 'rect', 'erase']);
});

test('배양 캡슐(가로 1칸 × 세로 2칸)은 두 칸을 차지하고 그림으로 보인다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'capsule_1');
  const img = await env.page.evaluate(() => {
    const i = document.querySelector('.palette-block[data-block-id="capsule_1"] img');
    return i ? { w: i.naturalWidth, h: i.naturalHeight } : null;
  });
  assert.deepEqual(img, { w: 887, h: 1774 }, '원본 그림 그대로 쓴다');
  await clickCell(env.page, 10, 29);
  assert.equal(await count(env.page), 0, '맨 아래 칸에서는 아래가 맵 밖이라 놓이지 않는다');
  await clickCell(env.page, 10, 20);
  assert.equal(await count(env.page), 1);
  const p = await env.page.evaluate(() => window.__editor.getMap().layers.objects[0]);
  assert.deepEqual([p.b, p.x, p.y, p.w, p.h], ['capsule_1', 10, 20, 1, 2]);
  // 아래 칸을 지우개로 눌러도 캡슐 전체가 지워진다
  await env.page.click('[data-tool=erase]');
  await clickCell(env.page, 10, 21);
  assert.equal(await count(env.page), 0);
  assert.deepEqual(env.errors, []);
});

test('큰 그림은 단계별로 줄인 그림이 만들어지고, 목록 그림은 뭉개지지 않게 보인다', async () => {
  await openEditor(env.page);
  await env.page.waitForFunction(() => window.PR.Blocks.levelsOf('capsule_1').length > 1);
  const info = await env.page.evaluate(() => {
    const levels = window.PR.Blocks.levelsOf('capsule_1');
    const pal = document.querySelector('.palette-block .swatch img');
    return { widths: levels.map((l) => l.w), first: levels[0].w, smallest: levels[levels.length - 1].w, pal: getComputedStyle(pal).imageRendering };
  });
  assert.equal(info.first, 887);
  assert.ok(info.widths.length >= 4 && info.widths.every((w, i) => i === 0 || w < info.widths[i - 1]));
  assert.ok(info.smallest < 64);
  assert.notEqual(info.pal, 'pixelated', '크게 줄여 보여주는 그림에 pixelated를 쓰면 깨져 보인다');
});

test('금속 패널 벽(가로 1칸 × 세로 3칸)은 세 칸을 차지하고 원본 그림 그대로 쓴다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'panel_1');
  const img = await env.page.evaluate(() => {
    const i = document.querySelector('.palette-block[data-block-id="panel_1"] img');
    return i ? { w: i.naturalWidth, h: i.naturalHeight } : null;
  });
  assert.deepEqual(img, { w: 620, h: 1860 }, '여백을 잘라 칸에 꽉 차게 맞춘 그림');
  await clickCell(env.page, 5, 28);
  assert.equal(await count(env.page), 0, '아래 두 칸이 맵 밖이라 놓이지 않는다');
  await clickCell(env.page, 5, 27);
  assert.equal(await count(env.page), 1);
  const p = await env.page.evaluate(() => window.__editor.getMap().layers.walls[0]);
  assert.deepEqual([p.b, p.x, p.y, p.w, p.h], ['panel_1', 5, 27, 1, 3]);
  await env.page.click('[data-tool=erase]');
  await clickCell(env.page, 5, 29);
  assert.equal(await count(env.page), 0, '아래 칸을 눌러도 전체가 지워진다');
  assert.deepEqual(env.errors, []);
});

test('벽 앞에 물건을 놓으면 벽이 지워지지 않고 겹쳐 보인다', async () => {
  await openEditor(env.page);
  const layers = await env.page.locator('[data-layer]').evaluateAll((els) => els.map((e) => e.dataset.layer));
  assert.deepEqual(layers, ['floor', 'walls', 'objects']);
  await pick(env.page, 'panel_1');
  await clickCell(env.page, 5, 5);
  assert.equal(await count(env.page), 1);
  await pick(env.page, 'capsule_1');
  await clickCell(env.page, 5, 6);
  assert.equal(await count(env.page), 2, '벽이 지워지지 않는다');
  const both = await env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return { wall: m.layers.walls.map((p) => p.b), obj: m.layers.objects.map((p) => p.b) };
  });
  assert.deepEqual(both, { wall: ['panel_1'], obj: ['capsule_1'] });
  // 물건 층 지우개는 물건만, 벽 층 지우개는 벽만 지운다
  await env.page.click('[data-tool=erase]');
  await clickCell(env.page, 5, 6);
  assert.equal(await count(env.page), 1);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.walls.length), 1);
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 2);
  await env.page.click('[data-layer=walls]');
  await clickCell(env.page, 5, 6);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.objects.length), 0, '어느 층이 선택돼 있어도 맨 위 물건이 먼저 지워진다');
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.walls.length), 1);
  await clickCell(env.page, 5, 6);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.walls.length), 0, '물건이 없으면 그 아래 벽이 지워진다');
  assert.deepEqual(env.errors, []);
});

test('벽 층에는 벽 블록만, 물건 층에는 물건 블록만 보인다', async () => {
  await openEditor(env.page);
  await env.page.click('[data-layer=walls]');
  const ids = () => env.page.locator('.palette-block').evaluateAll((els) => els.map((e) => e.dataset.blockId));
  const walls = await ids();
  assert.ok(walls.includes('panel_1'));
  assert.ok(!walls.includes('capsule_1'));
  await env.page.click('[data-layer=objects]');
  assert.ok(!(await ids()).includes('panel_1'));
});

test('예전에 물건 층에 저장된 벽 블록이 있는 맵도 열리고 벽 층으로 옮겨진다', async () => {
  await env.page.goto(pageUrl('index.html'));
  const id = await env.page.evaluate(() => {
    const m = window.__store.createMap({ name: '옛 맵', width: 10, height: 10 });
    const data = window.PR.MapFormat.serializeMap(m);
    delete data.walls;
    data.objects = [['panel_1', 2, 2, 1]];
    localStorage.setItem('pr.map.' + m.id, JSON.stringify(data));
    return m.id;
  });
  await env.page.goto(pageUrl('editor.html') + '?id=' + id);
  await env.page.waitForFunction(() => window.__editor && window.__editor.getMap());
  const layers = await env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return { walls: m.layers.walls.length, objects: m.layers.objects.length };
  });
  assert.deepEqual(layers, { walls: 1, objects: 0 });
});

test('벽 윗면(천장) 블록은 벽 층의 막히는 블록이고, 그 위에 물건을 겹쳐 놓을 수 있다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'wall_top_1');
  const img = await env.page.evaluate(() => {
    const i = document.querySelector('.palette-block[data-block-id="wall_top_1"] img');
    return i ? { w: i.naturalWidth, h: i.naturalHeight } : null;
  });
  assert.deepEqual(img, { w: 1254, h: 1254 }, '원본 그림 그대로 쓴다');
  const def = await env.page.evaluate(() => window.PR.Blocks.get('wall_top_1'));
  assert.deepEqual([def.layer, def.w, def.h, def.solid], ['walls', 1, 1, true]);
  await dragCells(env.page, 3, 3, 6, 3);
  assert.equal(await env.page.evaluate(() => window.__editor.getMap().layers.walls.length), 4);
  await pick(env.page, 'capsule_1');
  await clickCell(env.page, 4, 3);
  assert.equal(await count(env.page), 5, '벽 윗면 위에 물건을 놓아도 벽이 지워지지 않는다');
  assert.deepEqual(env.errors, []);
});

test('지우개는 선택한 층과 상관없이 항상 눈에 보이는 맨 위 블록부터 지우고, 되돌리기로 하나씩 복구된다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'floor_light_1');
  await clickCell(env.page, 3, 3);
  await pick(env.page, 'wall_top_1');
  await clickCell(env.page, 3, 3);
  await pick(env.page, 'test_crate');
  await clickCell(env.page, 3, 3);
  assert.equal(await count(env.page), 3);
  await env.page.click('[data-layer=floor]'); // 일부러 맨 아래 층을 선택해 둔다
  await env.page.click('[data-tool=erase]');
  const left = () => env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return [m.layers.floor.length, m.layers.walls.length, m.layers.objects.length];
  });
  await clickCell(env.page, 3, 3);
  assert.deepEqual(await left(), [1, 1, 0], '물건이 먼저');
  await clickCell(env.page, 3, 3);
  assert.deepEqual(await left(), [1, 0, 0], '그다음 벽');
  await clickCell(env.page, 3, 3);
  assert.deepEqual(await left(), [0, 0, 0], '마지막으로 바닥');
  await env.page.keyboard.press('Control+z');
  assert.deepEqual(await left(), [1, 0, 0]);
  await env.page.keyboard.press('Control+z');
  await env.page.keyboard.press('Control+z');
  assert.deepEqual(await left(), [1, 1, 1]);
});

test('끌어서 지울 때 두 칸짜리 물건을 지운 뒤 그 아래 벽까지 파고들어 지우지 않는다', async () => {
  await openEditor(env.page);
  await pick(env.page, 'test_wall');
  await clickCell(env.page, 5, 5);
  await clickCell(env.page, 5, 6);
  await pick(env.page, 'capsule_1');
  await clickCell(env.page, 5, 5);
  assert.equal(await count(env.page), 3);
  await env.page.click('[data-tool=erase]');
  await dragCells(env.page, 5, 5, 5, 6);
  const left = await env.page.evaluate(() => {
    const m = window.__editor.getMap();
    return [m.layers.walls.length, m.layers.objects.length];
  });
  assert.deepEqual(left, [2, 0], '캡슐만 지워지고 벽 두 칸은 남는다');
  await env.page.keyboard.press('Control+z');
  assert.equal(await count(env.page), 3, '끌어서 지운 것은 되돌리기 한 번에 복구');
});
