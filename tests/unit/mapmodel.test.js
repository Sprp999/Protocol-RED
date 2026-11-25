const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../js/mapmodel.js');

const blk = (id, w = 1, h = 1) => ({ id, w, h });
const snap = (map) => JSON.stringify({
  floor: [...map.layers.floor].sort((a, b) => a.uid - b.uid),
  walls: [...map.layers.walls].sort((a, b) => a.uid - b.uid),
  objects: [...map.layers.objects].sort((a, b) => a.uid - b.uid),
  start: map.start,
  exits: map.exits,
});
const newMap = (w = 40, h = 30) => M.createMap({ id: 't', name: '시험', width: w, height: h });

test('createMap은 두 층이 비어 있고 한 칸이 64인 맵을 만든다', () => {
  const m = newMap();
  assert.equal(m.width, 40);
  assert.equal(m.height, 30);
  assert.equal(m.tileSize, 64);
  assert.equal(m.version, 1);
  assert.deepEqual(m.layers, { floor: [], walls: [], objects: [] });
  assert.equal(m.start, null);
  assert.deepEqual(m.exits, []);
});

test('createMap은 범위를 벗어나거나 정수가 아닌 크기를 거부한다', () => {
  for (const [w, h] of [[0, 5], [1001, 5], [3.5, 5], [5, 0], [5, 1001], [5, 2.5]]) {
    assert.throws(() => M.createMap({ id: 'x', name: 'x', width: w, height: h }), RangeError, `${w}x${h}`);
  }
});

test('placeBlock은 블록을 놓고 범위 밖과 같은 자리 중복은 null', () => {
  const m = newMap();
  const p = M.placeBlock(m, 'objects', blk('wall'), 3, 4);
  assert.ok(p);
  assert.equal(M.placementAt(m, 'objects', 3, 4).b, 'wall');
  assert.equal(M.placementAt(m, 'objects', 4, 4), null);
  assert.equal(M.placeBlock(m, 'objects', blk('wall'), -1, 0), null);
  assert.equal(M.placeBlock(m, 'objects', blk('wall'), 40, 0), null);
  assert.equal(M.placeBlock(m, 'objects', blk('wall'), 0, 30), null);
  assert.equal(M.placeBlock(m, 'objects', blk('wall'), 3, 4), null);
  assert.equal(M.countPlacements(m), 1);
});

test('여러 칸 구조물은 가장자리에 걸치면 놓이지 않고, 놓이면 모든 칸이 같은 구조물이다', () => {
  const m = newMap();
  assert.equal(M.placeBlock(m, 'objects', blk('house', 3, 2), 38, 0), null);
  assert.equal(M.placeBlock(m, 'objects', blk('house', 3, 2), 0, 29), null);
  assert.ok(M.placeBlock(m, 'objects', blk('house', 3, 2), 37, 0));
  const uids = new Set();
  for (let y = 0; y < 2; y++) for (let x = 37; x < 40; x++) uids.add(M.placementAt(m, 'objects', x, y).uid);
  assert.equal(uids.size, 1);
  assert.equal(M.placementAt(m, 'objects', 36, 0), null);
  assert.equal(M.placementAt(m, 'objects', 37, 2), null);
});

test('겹치면 겹친 구조물이 통째로 대체되고 다른 층은 영향이 없다', () => {
  const m = newMap();
  M.placeBlock(m, 'floor', blk('grass'), 38, 1);
  M.placeBlock(m, 'objects', blk('house', 3, 2), 37, 0);
  const p = M.placeBlock(m, 'objects', blk('crate'), 38, 1);
  assert.equal(p.ops[0].removed.length, 1);
  assert.equal(M.placementAt(m, 'objects', 37, 0), null);
  assert.equal(M.placementAt(m, 'objects', 38, 1).b, 'crate');
  assert.equal(M.placementAt(m, 'floor', 38, 1).b, 'grass');
  assert.equal(M.countPlacements(m), 2);
});

test('eraseAt은 구조물 전체를 지우고 빈 칸이면 null', () => {
  const m = newMap();
  M.placeBlock(m, 'objects', blk('house', 3, 2), 10, 10);
  assert.ok(M.eraseAt(m, 'objects', 12, 11));
  assert.equal(M.countPlacements(m), 0);
  assert.equal(M.placementAt(m, 'objects', 10, 10), null);
  assert.equal(M.eraseAt(m, 'objects', 12, 11), null);
});

test('fillRect는 블록 크기 단위로 영역을 채우고 모서리 순서는 상관없다', () => {
  const m = newMap();
  assert.ok(M.fillRect(m, 'floor', blk('g'), 2, 2, 5, 4));
  assert.equal(M.countPlacements(m), 12);
  const m2 = newMap();
  M.fillRect(m2, 'objects', blk('house', 3, 2), 0, 0, 5, 3);
  assert.equal(M.countPlacements(m2), 4);
  const m3 = newMap();
  M.fillRect(m3, 'floor', blk('g'), 5, 4, 2, 2);
  assert.equal(M.countPlacements(m3), 12);
  assert.equal(M.fillRect(newMap(), 'objects', blk('house', 3, 2), 0, 0, 1, 1), null);
});

test('eraseRect는 사각형에 걸친 구조물을 통째로 지운다', () => {
  const m = newMap();
  M.placeBlock(m, 'objects', blk('house', 3, 2), 10, 10);
  M.placeBlock(m, 'objects', blk('crate'), 20, 20);
  assert.ok(M.eraseRect(m, 'objects', 12, 11, 13, 12));
  assert.equal(M.placementAt(m, 'objects', 10, 10), null);
  assert.equal(M.countPlacements(m), 1);
  assert.equal(M.eraseRect(m, 'objects', 0, 0, 1, 1), null);
});

test('시작 지점은 하나만 있고 이동·제거가 된다', () => {
  const m = newMap();
  M.toggleStart(m, 1, 1);
  assert.deepEqual(m.start, { x: 1, y: 1 });
  M.toggleStart(m, 5, 5);
  assert.deepEqual(m.start, { x: 5, y: 5 });
  M.toggleStart(m, 5, 5);
  assert.equal(m.start, null);
  assert.equal(M.toggleStart(m, -1, 0), null);
  assert.equal(M.toggleStart(m, 40, 0), null);
});

test('출구는 여러 개 둘 수 있고 같은 칸을 다시 누르면 제거된다', () => {
  const m = newMap();
  M.toggleExit(m, 39, 29);
  M.toggleExit(m, 0, 0);
  assert.equal(m.exits.length, 2);
  M.toggleExit(m, 39, 29);
  assert.deepEqual(m.exits, [{ x: 0, y: 0 }]);
  assert.equal(M.toggleExit(m, 40, 0), null);
});

test('isComplete는 시작 지점과 출구가 모두 있어야 true', () => {
  const m = newMap();
  assert.equal(M.isComplete(m), false);
  M.toggleStart(m, 1, 1);
  assert.equal(M.isComplete(m), false);
  M.toggleExit(m, 2, 2);
  assert.equal(M.isComplete(m), true);
});

test('모든 연산의 패치는 되돌리고 다시 적용할 수 있고 칸 조회가 정확하다', () => {
  const m = newMap();
  M.placeBlock(m, 'floor', blk('grass'), 3, 3);
  M.placeBlock(m, 'objects', blk('house', 3, 2), 10, 10);
  M.toggleStart(m, 1, 1);
  const ops = [
    () => M.placeBlock(m, 'objects', blk('crate'), 11, 10),
    () => M.eraseAt(m, 'floor', 3, 3),
    () => M.fillRect(m, 'floor', blk('g'), 0, 0, 3, 3),
    () => M.eraseRect(m, 'floor', 1, 1, 2, 2),
    () => M.toggleStart(m, 7, 7),
    () => M.toggleExit(m, 9, 9),
    () => M.toggleExit(m, 9, 9),
  ];
  for (const op of ops) {
    const before = snap(m);
    const patch = op();
    assert.ok(patch);
    const after = snap(m);
    M.revertPatch(m, patch);
    assert.equal(snap(m), before);
    for (const layer of ['floor', 'objects']) for (const pl of m.layers[layer]) {
      assert.equal(M.placementAt(m, layer, pl.x, pl.y).uid, pl.uid);
    }
    M.applyPatch(m, patch);
    assert.equal(snap(m), after);
    for (const layer of ['floor', 'objects']) for (const pl of m.layers[layer]) {
      assert.equal(M.placementAt(m, layer, pl.x + pl.w - 1, pl.y + pl.h - 1).uid, pl.uid);
    }
  }
});

test('revert 뒤에는 지워졌던 칸이 비고 대체되었던 구조물이 돌아온다', () => {
  const m = newMap();
  M.placeBlock(m, 'objects', blk('house', 3, 2), 10, 10);
  const p = M.placeBlock(m, 'objects', blk('crate'), 11, 10);
  assert.equal(M.placementAt(m, 'objects', 10, 10), null);
  assert.equal(M.placementAt(m, 'objects', 11, 10).b, 'crate');
  M.revertPatch(m, p);
  assert.equal(M.placementAt(m, 'objects', 11, 10).b, 'house');
  assert.equal(M.placementAt(m, 'objects', 11, 10).b, 'house');
});

test('combinePatches를 되돌리면 모두 원상 복구된다', () => {
  const m = newMap();
  const before = snap(m);
  const p1 = M.placeBlock(m, 'floor', blk('a'), 1, 1);
  const p2 = M.placeBlock(m, 'floor', blk('a'), 2, 1);
  const p3 = M.toggleStart(m, 4, 4);
  const combined = M.combinePatches([p1, null, p2, p3]);
  assert.equal(combined.ops.length, 3);
  M.revertPatch(m, combined);
  assert.equal(snap(m), before);
  assert.equal(M.combinePatches([null, null]), null);
});

test('resizeMap은 안 맞는 블록과 표시를 잘라내고, countDroppedByResize가 그 수를 센다', () => {
  const m = newMap();
  M.placeBlock(m, 'objects', blk('crate'), 39, 29);
  M.placeBlock(m, 'objects', blk('house', 3, 2), 37, 0);
  M.placeBlock(m, 'floor', blk('g'), 5, 5);
  M.toggleExit(m, 39, 29);
  assert.equal(M.countDroppedByResize(m, 20, 20), 3);
  const small = M.resizeMap(m, 20, 20);
  assert.equal(small.width, 20);
  assert.equal(small.height, 20);
  assert.equal(M.countPlacements(small), 1);
  assert.deepEqual(small.exits, []);
  assert.equal(M.placementAt(small, 'floor', 5, 5).b, 'g');
  assert.equal(M.countDroppedByResize(m, 60, 40), 0);
  const big = M.resizeMap(m, 60, 40);
  assert.equal(big.width, 60);
  assert.equal(M.countPlacements(big), 3);
  assert.equal(M.placementAt(big, 'objects', 38, 1).b, 'house');
  assert.equal(M.countPlacements(m), 3, '원본은 바뀌지 않는다');
  assert.throws(() => M.resizeMap(m, 0, 5), RangeError);
});

test('맵은 가로·세로 최대 1000칸까지 만들 수 있다', () => {
  const m = M.createMap({ id: 'big', name: '큰 맵', width: 1000, height: 1000 });
  assert.equal(m.width, 1000);
  assert.equal(M.MAX_SIZE, 1000);
  assert.ok(M.placeBlock(m, 'floor', blk('g'), 999, 999));
  assert.equal(M.placementAt(m, 'floor', 999, 999).b, 'g');
});

test('placementsInRect는 사각형에 걸친 배치를 한 번씩만 돌려준다', () => {
  const m = newMap();
  M.fillRect(m, 'floor', blk('g'), 0, 0, 9, 9);
  M.placeBlock(m, 'objects', blk('house', 3, 2), 4, 4);
  M.placeBlock(m, 'objects', blk('crate'), 20, 20);
  assert.equal(M.placementsInRect(m, 'floor', 2, 2, 4, 3).length, 6);
  const objs = M.placementsInRect(m, 'objects', 5, 5, 6, 5);
  assert.equal(objs.length, 1, '걸친 구조물은 한 번만');
  assert.equal(objs[0].b, 'house');
  assert.equal(M.placementsInRect(m, 'objects', 0, 0, 3, 3).length, 0);
  assert.equal(M.placementsInRect(m, 'floor', -5, -5, 1, 1).length, 4, '맵 밖은 잘라서 본다');
  assert.equal(M.placementsInRect(m, 'floor', 100, 100, 120, 120).length, 0);
});

test('revision은 맵이 바뀔 때마다 커지고 되돌려도 달라진다', () => {
  const m = newMap();
  const r0 = M.revision(m);
  const p = M.placeBlock(m, 'floor', blk('g'), 1, 1);
  const r1 = M.revision(m);
  assert.ok(r1 > r0);
  M.revertPatch(m, p);
  assert.ok(M.revision(m) > r1);
  const r2 = M.revision(m);
  M.applyPatch(m, p);
  assert.ok(M.revision(m) > r2);
});

test('replaceWith는 같은 맵 객체를 새 크기의 내용으로 바꾼다', () => {
  const m = newMap();
  M.placeBlock(m, 'floor', blk('g'), 5, 5);
  M.placeBlock(m, 'objects', blk('crate'), 39, 29);
  const r0 = M.revision(m);
  M.replaceWith(m, M.resizeMap(m, 20, 20));
  assert.deepEqual([m.width, m.height], [20, 20]);
  assert.equal(M.countPlacements(m), 1);
  assert.equal(M.placementAt(m, 'floor', 5, 5).b, 'g');
  assert.equal(M.placementAt(m, 'objects', 19, 19), null);
  assert.ok(M.revision(m) > r0);
  assert.ok(M.placeBlock(m, 'floor', blk('g'), 19, 19), '새 크기에서 색인이 맞게 동작한다');
  assert.equal(M.placeBlock(m, 'floor', blk('g'), 20, 20), null);
});

test('벽 층과 물건 층은 서로 독립이라 같은 칸에 겹쳐 놓아도 지워지지 않는다', () => {
  const m = newMap();
  M.placeBlock(m, 'walls', blk('panel', 1, 3), 3, 3);
  const p = M.placeBlock(m, 'objects', blk('capsule', 1, 2), 3, 4);
  assert.equal(p.ops[0].removed.length, 0, '벽을 지우지 않는다');
  assert.equal(M.placementAt(m, 'walls', 3, 4).b, 'panel');
  assert.equal(M.placementAt(m, 'objects', 3, 4).b, 'capsule');
  assert.equal(M.countPlacements(m), 2);
  assert.equal(M.placementAt(m, 'floor', 3, 4), null);
});

test('벽 층 안에서는 같은 층 블록끼리만 서로 대체한다', () => {
  const m = newMap();
  M.placeBlock(m, 'walls', blk('panel', 1, 3), 3, 3);
  M.placeBlock(m, 'objects', blk('crate'), 3, 3);
  const p = M.placeBlock(m, 'walls', blk('wall'), 3, 4);
  assert.equal(p.ops[0].removed.length, 1);
  assert.equal(M.placementAt(m, 'walls', 3, 3), null);
  assert.equal(M.placementAt(m, 'walls', 3, 4).b, 'wall');
  assert.equal(M.placementAt(m, 'objects', 3, 3).b, 'crate');
});

test('벽 층의 지우기·되돌리기·크기 변경이 다른 층과 똑같이 동작한다', () => {
  const m = newMap();
  const before = snap(m);
  const p1 = M.placeBlock(m, 'walls', blk('panel', 1, 3), 39, 27);
  const p2 = M.eraseAt(m, 'walls', 39, 29);
  assert.equal(M.countPlacements(m), 0);
  M.revertPatch(m, p2);
  assert.equal(M.countPlacements(m), 1);
  assert.equal(M.countDroppedByResize(m, 20, 20), 1);
  assert.equal(M.countPlacements(M.resizeMap(m, 20, 20)), 0);
  assert.equal(M.countPlacements(M.resizeMap(m, 60, 40)), 1);
  M.revertPatch(m, p1);
  assert.equal(snap(m), before);
  assert.deepEqual(M.LAYERS, ['floor', 'walls', 'objects']);
});
