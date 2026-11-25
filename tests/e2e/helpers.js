const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

// 시험에서만 쓰는 블록. 진짜 블록 목록(data/blocks.js)에는 들어 있지 않다.
const TEST_BLOCKS = [
  { id: 'test_floor_gray', name: '시험 회색 바닥', layer: 'floor', category: '바닥', w: 1, h: 1, solid: false, color: '#4a4a4a' },
  { id: 'test_floor_dirt', name: '시험 흙 바닥', layer: 'floor', category: '바닥', w: 1, h: 1, solid: false, color: '#6b4a2b' },
  { id: 'test_wall', name: '시험 벽', layer: 'walls', category: '벽', w: 1, h: 1, solid: true, color: '#8a8a99' },
  { id: 'test_crate', name: '시험 상자', layer: 'objects', category: '물건', w: 1, h: 1, solid: true, color: '#a8742f' },
  { id: 'test_house', name: '시험 건물 3x2', layer: 'objects', category: '건물', w: 3, h: 2, solid: true, color: '#a33a3a' },
];

// fixture: false 이면 진짜 블록 목록만 쓰고, defs 를 주면 그 목록만 쓴다
async function launch({ fixture = true, defs: onlyDefs = null } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  if (fixture || onlyDefs) {
    const defs = onlyDefs || require('../../data/blocks.js').concat(TEST_BLOCKS);
    // data/blocks.js가 나중에 실행되어도 이 목록이 유지되도록, 대입은 무시하는 속성으로 만든다
    await context.addInitScript((list) => {
      window.PR = window.PR || {};
      Object.defineProperty(window.PR, 'BLOCK_DEFS', { configurable: true, get: () => list, set() {} });
    }, defs);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { browser, context, page, errors };
}

function pageUrl(name) {
  return 'file://' + path.join(ROOT, name);
}

// 편집 화면에서 (cx, cy) 칸의 가운데가 화면(페이지)에서 어디인지
async function cellToScreen(page, cx, cy) {
  return page.evaluate(([x, y]) => {
    const v = window.__editor.getView();
    const rect = document.getElementById('map-canvas').getBoundingClientRect();
    const cell = 64 * v.scale;
    return { x: rect.left + v.x + (x + 0.5) * cell, y: rect.top + v.y + (y + 0.5) * cell };
  }, [cx, cy]);
}

async function openEditor(page, { width = 40, height = 30 } = {}) {
  await page.goto(pageUrl('index.html'));
  const id = await page.evaluate(([w, h]) => window.__store.createMap({ name: '시험', width: w, height: h }).id, [width, height]);
  await page.goto(pageUrl('editor.html') + '?id=' + id);
  await page.waitForSelector('#map-canvas');
  await page.waitForFunction(() => window.__editor && window.__editor.getMap());
  return id;
}
const count = (page) => page.evaluate(() => {
  const m = window.__editor.getMap();
  return m.layers.floor.length + m.layers.walls.length + m.layers.objects.length;
});
async function pick(page, blockId) {
  const def = await page.evaluate((id) => window.PR.Blocks.get(id), blockId);
  await page.click(`[data-layer=${def.layer}]`);
  const tab = page.locator(`.palette-tab[data-category="${def.category}"]`);
  if (await tab.count()) await tab.click();
  await page.click(`.palette-block[data-block-id="${blockId}"]`);
}
async function clickCell(page, x, y) {
  const p = await cellToScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function dragCells(page, x0, y0, x1, y1, { release = true } = {}) {
  const a = await cellToScreen(page, x0, y0);
  const b = await cellToScreen(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  if (release) await page.mouse.up();
}

module.exports = { TEST_BLOCKS, launch, pageUrl, cellToScreen, openEditor, count, pick, clickCell, dragCells, ROOT };
