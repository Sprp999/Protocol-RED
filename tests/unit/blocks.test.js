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
    assert.ok(['floor', 'objects'].includes(b.layer), b.id);
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

test('그림 파일이 있는 블록은 파일이 실제로 있고 크기가 칸 수에 맞는 PNG다', () => {
  const withFile = real.filter((b) => b.file);
  assert.ok(withFile.length >= 1);
  for (const b of withFile) {
    const full = path.join(__dirname, '..', '..', b.file);
    assert.ok(fs.existsSync(full), `${b.id}: ${b.file} 파일이 없어요`);
    const buf = fs.readFileSync(full);
    assert.equal(buf.toString('latin1', 1, 4), 'PNG', `${b.id}: PNG 파일이 아니에요`);
    assert.equal(buf.readUInt32BE(16), b.w * 64, `${b.id}: 가로 크기`);
    assert.equal(buf.readUInt32BE(20), b.h * 64, `${b.id}: 세로 크기`);
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
