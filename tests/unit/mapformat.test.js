const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../js/mapmodel.js');
const F = require('../../js/mapformat.js');

const sizes = { grass: { w: 1, h: 1 }, wall: { w: 1, h: 1 }, house: { w: 3, h: 2 }, panel: { w: 1, h: 3 } };
const sizeOf = (id) => sizes[id] || null;
const blk = (id) => ({ id, ...sizes[id] });
const cells = (map) => {
  const out = [];
  for (const layer of ['floor', 'walls', 'objects']) {
    for (const p of map.layers[layer]) out.push(`${layer}:${p.b}@${p.x},${p.y}`);
  }
  return out.sort();
};

function sampleMap() {
  const m = M.createMap({ id: 'm1', name: '지하 창고', width: 40, height: 30 });
  M.fillRect(m, 'floor', blk('grass'), 0, 0, 39, 29);
  M.placeBlock(m, 'objects', blk('wall'), 5, 5);
  M.placeBlock(m, 'objects', blk('wall'), 6, 5);
  M.placeBlock(m, 'objects', blk('house'), 10, 10);
  M.placeBlock(m, 'walls', blk('panel'), 20, 5);
  M.placeBlock(m, 'objects', blk('house'), 20, 6);
  M.toggleStart(m, 2, 2);
  M.toggleExit(m, 38, 28);
  M.toggleExit(m, 1, 28);
  return m;
}

test('serialize → JSON 문자열 → parse 하면 같은 맵이 된다', () => {
  const m = sampleMap();
  const text = JSON.stringify(F.serializeMap(m));
  const back = F.parseMap(JSON.parse(text), sizeOf);
  assert.equal(back.id, 'm1');
  assert.equal(back.name, '지하 창고');
  assert.equal(back.width, 40);
  assert.equal(back.height, 30);
  assert.deepEqual(cells(back), cells(m));
  assert.deepEqual(back.start, { x: 2, y: 2 });
  assert.deepEqual(back.exits, m.exits);
  assert.equal(M.placementAt(back, 'objects', 12, 11).b, 'house');
});

test('같은 블록이 가로로 이어진 칸은 묶여서 저장된다', () => {
  const m = M.createMap({ id: 'big', name: '큰 맵', width: 200, height: 200 });
  M.fillRect(m, 'floor', blk('grass'), 0, 0, 199, 199);
  const data = F.serializeMap(m);
  assert.equal(data.floor.length, 200);
  assert.deepEqual(data.floor[0], ['grass', 0, 0, 200]);
  assert.ok(JSON.stringify(data).length < 10000);
  const back = F.parseMap(JSON.parse(JSON.stringify(data)), sizeOf);
  assert.equal(M.countPlacements(back), 40000);
});

test('여러 칸 블록도 블록 너비 간격으로 묶였다 풀린다', () => {
  const m = M.createMap({ id: 'h', name: '집들', width: 20, height: 10 });
  M.fillRect(m, 'objects', blk('house'), 0, 0, 8, 1);
  const data = F.serializeMap(m);
  assert.deepEqual(data.objects, [['house', 0, 0, 3]]);
  assert.equal(M.countPlacements(F.parseMap(data, sizeOf)), 3);
});

test('잘못된 데이터는 MapFormatError와 한국어 메시지로 거부된다', () => {
  const good = () => JSON.parse(JSON.stringify(F.serializeMap(sampleMap())));
  const bad = {
    null: null,
    문자열: '맵',
    배열: [],
    '버전 2': { ...good(), version: 2 },
    '가로 0': { ...good(), width: 0 },
    '가로 1001': { ...good(), width: 1001 },
    '항목 길이 틀림': { ...good(), floor: [['grass', 0, 0]] },
    '좌표 소수': { ...good(), floor: [['grass', 0.5, 0, 1]] },
    '좌표 음수': { ...good(), floor: [['grass', -1, 0, 1]] },
    '맵 밖': { ...good(), objects: [['wall', 40, 0, 1]] },
    '묶음이 맵 밖으로': { ...good(), objects: [['wall', 38, 0, 5]] },
    'exits가 배열 아님': { ...good(), exits: 'x' },
    '시작이 맵 밖': { ...good(), start: { x: 99, y: 0 } },
  };
  for (const [label, data] of Object.entries(bad)) {
    assert.throws(
      () => F.parseMap(data, sizeOf),
      (err) => err instanceof F.MapFormatError && typeof err.message === 'string' && err.message.length > 0,
      label
    );
  }
});

test('목록에 없는 블록 id도 1×1로 읽히고 id가 유지된다', () => {
  const data = { ...F.serializeMap(sampleMap()), objects: [['사라진블록', 3, 3, 2]] };
  const back = F.parseMap(data, sizeOf);
  assert.equal(M.placementAt(back, 'objects', 3, 3).b, '사라진블록');
  assert.equal(M.placementAt(back, 'objects', 4, 3).b, '사라진블록');
  assert.equal(F.serializeMap(back).objects[0][0], '사라진블록');
});

test('파일 안에서 겹치는 항목은 뒤에 온 것이 이긴다', () => {
  const data = { ...F.serializeMap(sampleMap()), objects: [['house', 10, 10, 1], ['wall', 11, 10, 1]] };
  const back = F.parseMap(data, sizeOf);
  assert.equal(M.placementAt(back, 'objects', 10, 10), null);
  assert.equal(M.placementAt(back, 'objects', 11, 10).b, 'wall');
});

test('벽 층도 저장했다가 그대로 읽히고, 벽과 물건이 겹쳐 있어도 둘 다 남는다', () => {
  const m = sampleMap();
  const data = JSON.parse(JSON.stringify(F.serializeMap(m)));
  assert.deepEqual(data.walls, [['panel', 20, 5, 1]]);
  const back = F.parseMap(data, sizeOf);
  assert.equal(M.placementAt(back, 'walls', 20, 7).b, 'panel');
  assert.equal(M.placementAt(back, 'objects', 21, 7).b, 'house');
  assert.deepEqual(cells(back), cells(m));
});

test('벽 층이 없던 예전 파일도 읽힌다', () => {
  const data = JSON.parse(JSON.stringify(F.serializeMap(sampleMap())));
  delete data.walls;
  const back = F.parseMap(data, sizeOf);
  assert.equal(back.layers.walls.length, 0);
});

test('벽 층 정보가 배열이 아니면 거부된다', () => {
  const data = { ...F.serializeMap(sampleMap()), walls: 'x' };
  assert.throws(() => F.parseMap(data, sizeOf), F.MapFormatError);
});

test('예전에 물건 층에 저장된 벽 블록은 읽을 때 벽 층으로 옮겨진다', () => {
  const data = JSON.parse(JSON.stringify(F.serializeMap(sampleMap())));
  delete data.walls;
  data.objects = [['panel', 5, 5, 1], ['house', 10, 10, 1]];
  const layerOf = (id) => (id === 'panel' ? 'walls' : id === 'house' ? 'objects' : null);
  const back = F.parseMap(data, sizeOf, layerOf);
  assert.equal(M.placementAt(back, 'walls', 5, 6).b, 'panel');
  assert.equal(M.placementAt(back, 'objects', 5, 5), null);
  assert.equal(M.placementAt(back, 'objects', 10, 10).b, 'house');
});
