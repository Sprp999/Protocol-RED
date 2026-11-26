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
    // 애니메이션 시트는 프레임 한 장의 크기로 본다
    const pw = buf.readUInt32BE(16) / (b.anim ? b.anim.cols : 1), ph = buf.readUInt32BE(20) / (b.anim ? b.anim.rows : 1);
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

// ---- 애니메이션 블록 (한 장에 프레임이 격자로 모인 그림) ----
function recordingFactory() {
  const made = [];
  const make = (w, h) => {
    const cv = { width: w, height: h, calls: [] };
    cv.getContext = () => ({ drawImage: (...a) => cv.calls.push(a), imageSmoothingEnabled: true });
    made.push(cv);
    return cv;
  };
  return { make, made };
}
const ANIM_DEF = { id: 'anim_t', name: '시험 애니', layer: 'walldeco', category: '벽꾸미기', w: 1, h: 1, solid: false, color: '#112233',
  file: 'x.png', anim: { frames: 16, cols: 4, rows: 4, fps: 16 } };
function withAnim(fn) {
  const saved = globalThis.PR.BLOCK_DEFS;
  globalThis.PR.BLOCK_DEFS = [ANIM_DEF];
  try { fn(); } finally { globalThis.PR.BLOCK_DEFS = saved; }
}

test('애니메이션 블록은 시트를 프레임 16장으로 잘라서 보관한다', () => withAnim(() => {
  const { make } = recordingFactory();
  const sheet = { width: 256, height: 256 };
  B.setImage('anim_t', sheet, make);
  assert.equal(B.frameCount('anim_t'), 16);
  const f0 = B.imageFor('anim_t', 64, 0).src;
  const f5 = B.imageFor('anim_t', 64, 5).src;
  const f15 = B.imageFor('anim_t', 64, 15).src;
  assert.notEqual(f0, f5);
  assert.deepEqual(f0.calls[0], [sheet, 0, 0, 64, 64, 0, 0, 64, 64]);
  assert.deepEqual(f5.calls[0], [sheet, 64, 64, 64, 64, 0, 0, 64, 64], '프레임 5는 둘째 줄 둘째 칸');
  assert.deepEqual(f15.calls[0], [sheet, 192, 192, 64, 64, 0, 0, 64, 64]);
  assert.equal(B.imageFor('anim_t', 64, 21).src, f5, '프레임 번호는 돌고 돈다');
  assert.equal(f0.width, 64);
}));

test('frameAt은 시간(ms)과 초당 프레임으로 지금 보일 프레임 번호를 돌려준다', () => withAnim(() => {
  assert.equal(B.frameAt('anim_t', 0), 0);
  assert.equal(B.frameAt('anim_t', 62), 0);
  assert.equal(B.frameAt('anim_t', 63), 1, '16fps → 62.5ms마다 한 장');
  assert.equal(B.frameAt('anim_t', 1000), 0, '16장이 1초에 한 바퀴');
  assert.equal(B.frameAt('anim_t', 1000 + 625), 10);
  assert.equal(B.frameAt('없는블록', 500), 0);
  assert.equal(B.animFpsOf('anim_t'), 16);
  assert.equal(B.animFpsOf('없는블록'), 0);
}));

test('애니메이션이 없는 블록은 프레임이 한 장이다', () => withFixture(() => {
  assert.equal(B.frameCount('f1'), 1);
  assert.equal(B.frameAt('f1', 5000), 0);
  assert.equal(B.animFpsOf('f1'), 0);
}));

test('환풍기는 벽꾸미기 층의 16프레임(4×4) 애니메이션 블록이고 시트 파일이 격자에 맞는다', () => {
  const fan = real.find((b) => b.id === 'fan_1');
  assert.ok(fan, 'fan_1 블록이 없어요');
  assert.deepEqual([fan.layer, fan.category, fan.w, fan.h, fan.solid], ['walldeco', '벽꾸미기', 1, 1, true]);
  assert.deepEqual([fan.anim.frames, fan.anim.cols, fan.anim.rows], [16, 4, 4]);
  assert.ok(fan.anim.fps >= 1 && fan.anim.fps <= 60);
  const buf = fs.readFileSync(path.join(__dirname, '..', '..', fan.file));
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  assert.ok(pw % fan.anim.cols === 0 && ph % fan.anim.rows === 0, '시트가 격자로 나누어떨어져요');
  assert.equal(pw / fan.anim.cols, ph / fan.anim.rows, '프레임이 정사각형이에요');
  assert.ok(pw / fan.anim.cols >= 64);
});

// ---- 지나갈 수 있는지(solid)는 층이 정한다: 바닥·바닥꾸미기만 걸어다닐 수 있고, 벽·벽꾸미기·물건은 전부 막힌다 ----
test('모든 블록의 막힘(solid)은 층의 규칙과 같다 (바닥 계열만 통과, 나머지는 막힘)', () => {
  const MM = require('../../js/mapmodel.js');
  assert.deepEqual(MM.LAYER_SOLID, { floor: false, floordeco: false, walls: true, walldeco: true, objects: true });
  for (const b of real) {
    assert.equal(b.solid, MM.LAYER_SOLID[b.layer], `${b.id}(${b.layer}): solid 가 ${MM.LAYER_SOLID[b.layer]}여야 해요`);
  }
});

test('벽에 붙은 꾸미기(환풍기)는 통과할 수 없다', () => {
  assert.equal(real.find((b) => b.id === 'fan_1').solid, true);
});
