const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

async function launch() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
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

module.exports = { launch, pageUrl, cellToScreen, ROOT };
