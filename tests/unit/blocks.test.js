const test = require('node:test');
const assert = require('node:assert/strict');
require('../../data/blocks.js');
const B = require('../../js/blocks.js');

test('블록 id는 모두 유일하다', () => {
  const ids = B.all().map((b) => b.id);
  assert.ok(ids.length >= 5);
  assert.equal(new Set(ids).size, ids.length);
});

test('모든 블록은 올바른 크기·층·색을 가진다', () => {
  for (const b of B.all()) {
    assert.ok(Number.isInteger(b.w) && b.w >= 1, b.id);
    assert.ok(Number.isInteger(b.h) && b.h >= 1, b.id);
    assert.ok(['floor', 'objects'].includes(b.layer), b.id);
    assert.match(b.color, /^#[0-9a-fA-F]{6}$/, b.id);
    assert.equal(typeof b.solid, 'boolean', b.id);
    assert.ok(b.name && b.category, b.id);
  }
});

test('get과 sizeOf는 크기를 알려주고 없는 블록은 null', () => {
  assert.equal(B.get('tmp_house').w, 3);
  assert.equal(B.get('tmp_house').h, 2);
  assert.deepEqual(B.sizeOf('tmp_house'), { w: 3, h: 2 });
  assert.equal(B.get('없는것'), null);
  assert.equal(B.sizeOf('없는것'), null);
});

test('byLayer와 categories는 층별로 나뉜다', () => {
  assert.ok(B.byLayer('floor').length >= 2);
  assert.ok(B.byLayer('floor').every((b) => b.layer === 'floor'));
  assert.ok(B.byLayer('objects').every((b) => b.layer === 'objects'));
  assert.ok(B.categories('objects').length >= 1);
  assert.equal(new Set(B.categories('floor')).size, B.categories('floor').length);
});

test('그림 파일이 있는 블록은 파일이 실제로 있고 크기가 칸 수에 맞는 PNG다', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const withFile = B.all().filter((b) => b.file);
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
