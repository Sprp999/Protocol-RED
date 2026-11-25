const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../js/mapmodel.js');
const H = require('../../js/history.js');

const blk = (id) => ({ id, w: 1, h: 1 });
const newMap = () => M.createMap({ id: 'h', name: '기록', width: 10, height: 10 });

test('새 기록은 되돌릴 것도 다시할 것도 없다', () => {
  const h = H.createHistory();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(newMap()), false);
  assert.equal(h.redo(newMap()), false);
});

test('commit 뒤 undo로 되돌리고 redo로 다시 한다', () => {
  const m = newMap();
  const h = H.createHistory();
  h.commit(M.placeBlock(m, 'floor', blk('a'), 1, 1));
  assert.equal(h.canUndo(), true);
  assert.equal(h.undo(m), true);
  assert.equal(M.countPlacements(m), 0);
  assert.equal(h.canRedo(), true);
  assert.equal(h.redo(m), true);
  assert.equal(M.countPlacements(m), 1);
  assert.equal(M.placementAt(m, 'floor', 1, 1).b, 'a');
});

test('되돌린 뒤 새 commit을 하면 다시하기가 사라진다', () => {
  const m = newMap();
  const h = H.createHistory();
  h.commit(M.placeBlock(m, 'floor', blk('a'), 1, 1));
  h.undo(m);
  h.commit(M.placeBlock(m, 'floor', blk('b'), 2, 2));
  assert.equal(h.canRedo(), false);
});

test('null과 빈 패치는 무시한다', () => {
  const h = H.createHistory();
  h.commit(null);
  h.commit({ ops: [] });
  assert.equal(h.canUndo(), false);
});

test('150번 commit 해도 정확히 100번까지만 되돌릴 수 있다', () => {
  const m = newMap();
  const h = H.createHistory(100);
  for (let i = 0; i < 150; i++) h.commit(M.toggleExit(m, i % 10, Math.floor(i / 10) % 10));
  let n = 0;
  while (h.undo(m)) n++;
  assert.equal(n, 100);
  assert.equal(h.undo(m), false);
});

test('clear 하면 둘 다 비워진다', () => {
  const m = newMap();
  const h = H.createHistory();
  h.commit(M.placeBlock(m, 'floor', blk('a'), 1, 1));
  h.undo(m);
  h.clear();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});
