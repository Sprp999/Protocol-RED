const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, pageUrl, pick, clickCell, dragCells, count } = require('./helpers.js');

// 처음부터 끝까지: 맵 만들기 → 배치 → 되돌리기 → 내보내기 → 완전히 새 브라우저에서 불러오기 → 같은 맵
test('내보낸 파일을 새 브라우저에서 불러오면 같은 맵이 열린다', async () => {
  const a = await launch();
  const b = await launch();
  try {
    a.page.setDefaultTimeout(5000);
    b.page.setDefaultTimeout(5000);
    await a.page.goto(pageUrl('index.html'));
    await a.page.click('#btn-new-map');
    await a.page.fill('#new-name', '여행 시험');
    await a.page.fill('#new-width', '24');
    await a.page.fill('#new-height', '16');
    await a.page.click('#new-ok');
    await a.page.click('.map-card .btn-open');
    await a.page.waitForFunction(() => window.__editor && window.__editor.getMap());
    await pick(a.page, 'test_floor_gray');
    await a.page.click('[data-tool=rect]');
    await dragCells(a.page, 0, 0, 23, 15);
    await a.page.click('[data-tool=brush]');
    await pick(a.page, 'test_house');
    await clickCell(a.page, 4, 3);
    await pick(a.page, 'test_wall');
    await dragCells(a.page, 0, 0, 10, 0);
    await a.page.keyboard.press('Control+z');
    await a.page.click('[data-tool=start]');
    await clickCell(a.page, 2, 8);
    await a.page.click('[data-tool=exit]');
    await clickCell(a.page, 22, 14);
    const before = await a.page.evaluate(() => JSON.stringify(window.PR.MapFormat.serializeMap(window.__editor.getMap())));
    await a.page.waitForFunction(() => document.getElementById('save-status').textContent.includes('저장됨'));
    await a.page.click('#btn-back');
    const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#btn-export')]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-roundtrip-'));
    const file = path.join(dir, 'backup.json');
    await download.saveAs(file);

    await b.page.goto(pageUrl('index.html'));
    await b.page.setInputFiles('#input-import', file);
    await b.page.waitForSelector('.map-card');
    assert.equal(await b.page.locator('.badge-incomplete').count(), 0);
    await b.page.click('.map-card .btn-open');
    await b.page.waitForFunction(() => window.__editor && window.__editor.getMap());
    const after = await b.page.evaluate(() => JSON.stringify(window.PR.MapFormat.serializeMap(window.__editor.getMap())));
    const norm = (s) => { const o = JSON.parse(s); delete o.id; return JSON.stringify(o); };
    assert.equal(norm(after), norm(before));
    assert.equal(await count(b.page), 24 * 16 + 1);
    assert.deepEqual(a.errors.concat(b.errors), []);
  } finally {
    await a.browser.close();
    await b.browser.close();
  }
});
