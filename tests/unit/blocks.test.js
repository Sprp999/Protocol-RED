const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const real = require('../../data/blocks.js'); // 진짜 블록 목록
const B = require('../../js/blocks.js');

// 함수 동작을 보려고 쓰는 시험용 목록 (진짜 목록과는 별개)
const FIXTURE = [
  { id: 'f1', name: '바닥1', layer: 'floor', category: '바닥', w: 1, h: 1, solid: false, color: '#111111' },
  { id: 'f2', name: '바닥2', layer: 'floor', category: '바닥', w: 1, h: 1, solid: false, color: '#222222' },
  { id: 'o1', name: '벽', layer: 'objects', category: '벽', w: 1, h: 1, solid: true, color: '#333333' },
  { id: 'o2', name: '건물', layer: 'objects', category: '건물', w: 3, h: 2, solid: true, color: '#444444' },
];
function withFixture(fn) {
  const saved = globalThis.PR.BLOCK_DEFS;
  globalThis.PR.BLOCK_DEFS = FIXTURE;
  try { fn(); } finally { globalThis.PR.BLOCK_DEFS = saved; }
}

test('진짜 블록 목록: id는 유일하고 모든 항목이 올바른 크기·층·색을 가진다', () => {
  assert.ok(real.length >= 1);
  assert.equal(new Set(real.map((b) => b.id)).size, real.length);
  for (const b of real) {
    assert.ok(Number.isInteger(b.w) && b.w >= 1, b.id);
    assert.ok(Number.isInteger(b.h) && b.h >= 1, b.id);
    assert.ok(['floor', 'floordeco', 'walls', 'walldeco', 'objects'].includes(b.layer), b.id);
    assert.match(b.color, /^#[0-9a-fA-F]{6}$/, b.id);
    assert.equal(typeof b.solid, 'boolean', b.id);
    assert.ok(b.name && b.category, b.id);
  }
});

test('진짜 블록 목록에는 임시 블록이 없고 모두 그림 파일이 있다', () => {
  for (const b of real) {
    assert.ok(!b.id.startsWith('tmp_'), `${b.id}: 임시 블록이 남아 있어요`);
    assert.ok(b.file, `${b.id}: 그림 파일(file)이 없어요`);
  }
});

test('그림 파일이 있는 블록은 파일이 실제로 있고, 칸 수와 같은 비율의 PNG다 (크기는 클수록 좋다)', () => {
  const withFile = real.filter((b) => b.file);
  assert.ok(withFile.length >= 1);
  for (const b of withFile) {
    const full = path.join(__dirname, '..', '..', b.file);
    assert.ok(fs.existsSync(full), `${b.id}: ${b.file} 파일이 없어요`);
    const buf = fs.readFileSync(full);
    assert.equal(buf.toString('latin1', 1, 4), 'PNG', `${b.id}: PNG 파일이 아니에요`);
    const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
    assert.ok(pw >= b.w * 64 && ph >= b.h * 64, `${b.id}: 그림이 한 칸 64픽셀보다 작아요 (${pw}x${ph})`);
    assert.ok(Math.abs(pw / b.w - ph / b.h) <= Math.max(pw / b.w, ph / b.h) * 0.01, `${b.id}: 그림 비율(${pw}x${ph})이 ${b.w}x${b.h}칸과 달라요`);
  }
});

test('get과 sizeOf는 크기를 알려주고 없는 블록은 null', () => withFixture(() => {
  assert.equal(B.get('o2').w, 3);
  assert.equal(B.get('o2').h, 2);
  assert.deepEqual(B.sizeOf('o2'), { w: 3, h: 2 });
  assert.equal(B.get('없는것'), null);
  assert.equal(B.sizeOf('없는것'), null);
}));

test('byLayer와 categories는 층별로 나뉘고 블록이 없는 층은 비어 있다', () => withFixture(() => {
  assert.deepEqual(B.byLayer('floor').map((b) => b.id), ['f1', 'f2']);
  assert.deepEqual(B.byLayer('objects').map((b) => b.id), ['o1', 'o2']);
  assert.deepEqual(B.categories('floor'), ['바닥']);
  assert.deepEqual(B.categories('objects'), ['벽', '건물']);
  const saved = globalThis.PR.BLOCK_DEFS;
  globalThis.PR.BLOCK_DEFS = FIXTURE.filter((b) => b.layer === 'floor');
  assert.deepEqual(B.byLayer('objects'), []);
  assert.deepEqual(B.categories('objects'), []);
  globalThis.PR.BLOCK_DEFS = saved;
}));

// ---- 큰 그림을 단계별로 줄여 두었다가 화면 크기에 맞는 것을 고른다 (밉맵) ----
const fakeImg = (w, h) => ({ width: w, height: h });
const fakeFactory = (w, h) => ({ width: w, height: h, getContext: () => ({ drawImage() {} }) });

test('buildLevels는 큰 그림을 절반씩 줄인 단계를 만든다', () => {
  const levels = B.buildLevels(fakeImg(887, 1774), fakeFactory);
  assert.deepEqual(levels.map((l) => [l.w, l.h]), [[887, 1774], [444, 887], [222, 444], [111, 222], [56, 111], [28, 56]]);
  assert.equal(levels[0].src.width, 887, '첫 단계는 원본 그림 그대로');
});

test('buildLevels는 캔버스를 만들 수 없으면 원본 한 단계만 돌려준다', () => {
  const levels = B.buildLevels(fakeImg(100, 100), null);
  assert.equal(levels.length, 1);
});

test('pickLevel은 필요한 크기보다 크거나 같은 단계 중 가장 작은 것을 고른다', () => {
  const levels = B.buildLevels(fakeImg(1024, 1024), fakeFactory);
  assert.equal(B.pickLevel(levels, 1024).w, 1024);
  assert.equal(B.pickLevel(levels, 600).w, 1024);
  assert.equal(B.pickLevel(levels, 512).w, 512);
  assert.equal(B.pickLevel(levels, 100).w, 128);
  assert.equal(B.pickLevel(levels, 5000).w, 1024, '원본보다 크게 그릴 땐 원본');
});

test('setImage로 등록한 그림은 image가 원본을, imageFor가 크기에 맞는 단계를 돌려준다', () => {
  const img = fakeImg(256, 256);
  B.setImage('x_test', img);
  assert.equal(B.image('x_test'), img);
  assert.equal(B.imageFor('x_test', 64).w, 256, '캔버스가 없는 환경에서는 원본 하나');
  assert.equal(B.imageFor('없는그림', 64), null);
  assert.equal(B.image('없는그림'), null);
});

// 옆으로 이어 놓는 벽 블록은 그림이 칸에 꽉 차서 틈이 없어야 한다
for (const id of ['panel_1', 'panel_2', 'wall_top_1']) {
  test(`${id}: 그림이 칸에 꽉 차서 옆으로 이어 놓아도 틈이 없다`, () => {
    const { PNG } = require('pngjs');
    const b = real.find((x) => x.id === id);
    assert.ok(b, `${id} 블록이 없어요`);
    const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, '..', '..', b.file)));
    const alphaAt = (x, y) => png.data[(y * png.width + x) * 4 + 3];
    const opaqueShare = (points) => points.filter(([x, y]) => alphaAt(x, y) >= 240).length / points.length;
    const cols = (x) => Array.from({ length: png.height }, (_, y) => [x, y]);
    const rows = (y) => Array.from({ length: png.width }, (_, x) => [x, y]);
    assert.ok(opaqueShare(cols(0)) > 0.95, '왼쪽 가장자리에 투명한 틈이 있어요');
    assert.ok(opaqueShare(cols(png.width - 1)) > 0.95, '오른쪽 가장자리에 투명한 틈이 있어요');
    assert.ok(opaqueShare(rows(0)) > 0.95, '위쪽 가장자리에 투명한 틈이 있어요');
    assert.ok(opaqueShare(rows(png.height - 1)) > 0.95, '아래쪽 가장자리에 투명한 틈이 있어요');
  });
}

test('금속 패널 벽은 벽 층에, 배양 캡슐은 물건 층에 있어서 서로 겹쳐 놓을 수 있다', () => {
  assert.equal(real.find((b) => b.id === 'panel_1').layer, 'walls');
  assert.equal(real.find((b) => b.id === 'capsule_1').layer, 'objects');
  assert.equal(B.layerOf('panel_1'), 'walls');
  assert.equal(B.layerOf('없는것'), null);
});

test('byLayer는 벽 층도 따로 나눈다', () => withFixture(() => {
  const saved = globalThis.PR.BLOCK_DEFS;
  globalThis.PR.BLOCK_DEFS = FIXTURE.concat([{ id: 'w1', name: '벽돌', layer: 'walls', category: '벽', w: 1, h: 1, solid: true, color: '#555555' }]);
  assert.deepEqual(B.byLayer('walls').map((b) => b.id), ['w1']);
  assert.deepEqual(B.categories('walls'), ['벽']);
  assert.equal(B.layerOf('w1'), 'walls');
  globalThis.PR.BLOCK_DEFS = saved;
}));

test('시작 깃발은 에디터 전용이라 블록 목록(게임용)에는 없고, 시작점 카테고리로 따로 나온다', () => {
  assert.ok(!real.some((b) => b.id === 'start_flag'), '게임용 블록 목록에 들어가면 안 돼요');
  assert.ok(!B.all().some((b) => b.id === 'start_flag'));
  const flag = B.get('start_flag');
  assert.ok(flag);
  assert.deepEqual([flag.layer, flag.category, flag.w, flag.h], ['start', '시작점', 1, 1]);
  assert.deepEqual(B.byLayer('start').map((b) => b.id), ['start_flag']);
  assert.deepEqual(B.categories('start'), ['시작점']);
  assert.equal(B.layerOf('start_flag'), 'start');
  const full = path.join(__dirname, '..', '..', flag.file);
  assert.ok(fs.existsSync(full), '깃발 그림 파일이 없어요');
});
