const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, pageUrl } = require('./helpers.js');

let env;
test.beforeEach(async () => {
  env = await launch();
  env.page.setDefaultTimeout(5000);
  await env.page.goto(pageUrl('index.html'));
});
test.afterEach(async () => {
  await env.browser.close();
});

async function createViaUi(page, name, w = 30, h = 20) {
  await page.click('#btn-new-map');
  await page.fill('#new-name', name);
  await page.fill('#new-width', String(w));
  await page.fill('#new-height', String(h));
  await page.click('#new-ok');
  await page.waitForSelector('.map-card >> text=' + name);
}
const cardNames = (page) => page.locator('.map-card .card-name').allTextContents();

test('처음에는 카드가 없고 안내 문구가 보인다', async () => {
  assert.equal(await env.page.locator('.map-card').count(), 0);
  assert.ok(await env.page.locator('#empty-hint').isVisible());
  assert.deepEqual(env.errors, []);
});

test('새 맵을 만들면 이름·크기·미완성 표시가 보이고, 잘못된 크기는 막힌다', async () => {
  await env.page.click('#btn-new-map');
  await env.page.fill('#new-name', '지하창고');
  await env.page.fill('#new-width', '201');
  await env.page.fill('#new-height', '20');
  await env.page.click('#new-ok');
  assert.notEqual((await env.page.textContent('#new-error')).trim(), '');
  assert.equal(await env.page.locator('.map-card').count(), 0);
  await env.page.fill('#new-width', '30');
  await env.page.click('#new-ok');
  await env.page.waitForSelector('.map-card');
  const card = env.page.locator('.map-card').first();
  assert.equal((await card.locator('.card-name').textContent()).trim(), '지하창고');
  assert.match(await card.locator('.card-size').textContent(), /30×20/);
  assert.equal((await card.locator('.card-index').textContent()).trim(), '1');
  assert.equal(await card.locator('.badge-incomplete').count(), 1);
  assert.equal(await env.page.locator('#empty-hint').isVisible(), false);
  assert.deepEqual(env.errors, []);
});

test('순서 바꾸기(위/아래 버튼과 끌어놓기)가 새로고침 뒤에도 유지된다', async () => {
  for (const n of ['A', 'B', 'C']) await createViaUi(env.page, n);
  await env.page.locator('.map-card').nth(0).locator('.btn-down').click();
  assert.deepEqual(await cardNames(env.page), ['B', 'A', 'C']);
  await env.page.locator('.map-card').nth(2).locator('.btn-up').click();
  assert.deepEqual(await cardNames(env.page), ['B', 'C', 'A']);
  await env.page.reload();
  assert.deepEqual(await cardNames(env.page), ['B', 'C', 'A']);
  assert.deepEqual(await env.page.locator('.card-index').allTextContents(), ['1', '2', '3']);
  await env.page.locator('.map-card').nth(2).dragTo(env.page.locator('.map-card').nth(0));
  assert.deepEqual(await cardNames(env.page), ['A', 'B', 'C']);
});

test('복제는 원본 바로 뒤에 "복사"가 붙고, 삭제는 확인 후에만 지워진다', async () => {
  await createViaUi(env.page, '원본');
  await createViaUi(env.page, '다음');
  await env.page.locator('.map-card').nth(0).locator('.btn-dup').click();
  assert.deepEqual(await cardNames(env.page), ['원본', '원본 복사', '다음']);
  env.page.once('dialog', (d) => d.dismiss());
  await env.page.locator('.map-card').nth(1).locator('.btn-del').click();
  assert.equal(await env.page.locator('.map-card').count(), 3);
  env.page.once('dialog', (d) => d.accept());
  await env.page.locator('.map-card').nth(1).locator('.btn-del').click();
  assert.deepEqual(await cardNames(env.page), ['원본', '다음']);
});

test('전체 내보내기 파일을 불러오면 맵이 추가되고, 깨진 파일은 거부된다', async () => {
  await createViaUi(env.page, '1번');
  await createViaUi(env.page, '2번');
  const [download] = await Promise.all([env.page.waitForEvent('download'), env.page.click('#btn-export')]);
  assert.match(download.suggestedFilename(), /^protocol-red-maps-\d{8}\.json$/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-e2e-'));
  const file = path.join(dir, 'backup.json');
  await download.saveAs(file);
  await env.page.setInputFiles('#input-import', file);
  await env.page.waitForFunction(() => document.querySelectorAll('.map-card').length === 4);
  assert.deepEqual(await cardNames(env.page), ['1번', '2번', '1번', '2번']);
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '아무말');
  await env.page.setInputFiles('#input-import', bad);
  await env.page.waitForFunction(() => document.getElementById('list-message').textContent.trim() !== '');
  assert.equal(await env.page.locator('.map-card').count(), 4);
  assert.deepEqual(env.errors, []);
});

test('맵 50개도 모두 보이고 오류가 없으며 썸네일이 그려진다', async () => {
  await env.page.evaluate(() => {
    const MM = window.PR.MapModel;
    for (let i = 1; i <= 50; i++) {
      const m = window.__store.createMap({ name: '맵 ' + i, width: 60, height: 40 });
      MM.fillRect(m, 'floor', { id: 'tmp_floor_gray', w: 1, h: 1 }, 0, 0, 59, 39);
      MM.placeBlock(m, 'objects', { id: 'tmp_house', w: 3, h: 2 }, 5, 5);
      window.__store.saveMap(m);
    }
  });
  await env.page.reload();
  assert.equal(await env.page.locator('.map-card').count(), 50);
  const painted = await env.page.evaluate(() => {
    const c = document.querySelector('.map-card canvas');
    return c.width > 0 && c.height > 0;
  });
  assert.equal(painted, true);
  assert.deepEqual(env.errors, []);
});

test('열기 링크는 편집 화면 주소를 가리키고, 읽을 수 없는 맵은 삭제만 된다', async () => {
  await createViaUi(env.page, '열기시험');
  const id = await env.page.locator('.map-card').first().getAttribute('data-id');
  const href = await env.page.locator('.map-card .btn-open').first().getAttribute('href');
  assert.equal(href, 'editor.html?id=' + id);
  await env.page.evaluate(() => {
    localStorage.setItem('pr.map.broken1', '{깨짐');
    const order = JSON.parse(localStorage.getItem('pr.order'));
    localStorage.setItem('pr.order', JSON.stringify([...order, 'broken1']));
  });
  await env.page.reload();
  const broken = env.page.locator('.map-card[data-id=broken1]');
  assert.equal(await broken.locator('.badge-broken').count(), 1);
  assert.equal(await broken.locator('.btn-open').count(), 0);
  env.page.once('dialog', (d) => d.accept());
  await broken.locator('.btn-del').click();
  assert.equal(await env.page.locator('.map-card[data-id=broken1]').count(), 0);
});
