const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../js/mapmodel.js');
const F = require('../../js/mapformat.js');
const S = require('../../js/store.js');

function memBackend(opts = {}) {
  const data = new Map();
  let sets = 0;
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      sets++;
      if (opts.failAfter !== undefined && sets > opts.failAfter) {
        throw new DOMException('가득 참', 'QuotaExceededError');
      }
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
}
const blk = { id: 'wall', w: 1, h: 1 };
const names = (store) => store.listMeta().map((m) => m.name);

function completeMap(store, name) {
  const m = store.createMap({ name, width: 10, height: 8 });
  M.placeBlock(m, 'objects', blk, 1, 1);
  M.toggleStart(m, 0, 0);
  M.toggleExit(m, 9, 7);
  assert.equal(store.saveMap(m).ok, true);
  return m;
}

test('createMap → loadMap 왕복과 listMeta 순서', () => {
  const store = S.createStore(memBackend());
  const a = store.createMap({ name: '맵 A', width: 10, height: 8 });
  const b = store.createMap({ name: '맵 B', width: 20, height: 12 });
  assert.notEqual(a.id, b.id);
  assert.deepEqual(names(store), ['맵 A', '맵 B']);
  const loaded = store.loadMap(b.id);
  assert.equal(loaded.width, 20);
  assert.equal(loaded.height, 12);
  assert.equal(store.loadMap('없는id'), null);
  const meta = store.listMeta()[1];
  assert.deepEqual([meta.id, meta.width, meta.height, meta.broken], [b.id, 20, 12, false]);
});

test('saveMap은 내용을 갱신하고 완성 여부가 listMeta에 반영된다', () => {
  const store = S.createStore(memBackend());
  const m = store.createMap({ name: '맵', width: 10, height: 8 });
  assert.equal(store.listMeta()[0].complete, false);
  M.toggleStart(m, 0, 0);
  M.toggleExit(m, 9, 7);
  assert.equal(store.saveMap(m).ok, true);
  assert.equal(store.listMeta()[0].complete, true);
  assert.equal(store.loadMap(m.id).start.x, 0);
  assert.equal(store.listMeta().length, 1);
});

test('moveMap, duplicateMap, deleteMap', () => {
  const be = memBackend();
  const store = S.createStore(be);
  const a = store.createMap({ name: 'A', width: 5, height: 5 });
  const b = store.createMap({ name: 'B', width: 5, height: 5 });
  const c = store.createMap({ name: 'C', width: 5, height: 5 });
  store.moveMap(c.id, 0);
  assert.deepEqual(names(store), ['C', 'A', 'B']);
  store.moveMap(c.id, 99);
  assert.deepEqual(names(store), ['A', 'B', 'C']);
  const copy = store.duplicateMap(a.id);
  assert.deepEqual(names(store), ['A', 'A 복사', 'B', 'C']);
  assert.notEqual(copy.id, a.id);
  assert.equal(store.duplicateMap('없음'), null);
  store.deleteMap(b.id);
  assert.deepEqual(names(store), ['A', 'A 복사', 'C']);
  assert.equal(be.getItem('pr.map.' + b.id), null);
  assert.equal(store.loadMap(b.id), null);
});

test('저장 공간이 가득 차면 예외 없이 quota 실패를 알리고 기존 내용은 그대로다', () => {
  const be = memBackend();
  const store = S.createStore(be);
  const m = store.createMap({ name: '맵', width: 5, height: 5 });
  const before = be.getItem('pr.map.' + m.id);
  const full = S.createStore({ ...be, getItem: be.getItem, removeItem: be.removeItem, setItem() { throw new DOMException('가득', 'QuotaExceededError'); } });
  M.placeBlock(m, 'objects', blk, 1, 1);
  const res = full.saveMap(m);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'quota');
  assert.ok(res.message.length > 0);
  assert.equal(be.getItem('pr.map.' + m.id), before);
});

test('새 맵 만들기가 저장 공간 부족이면 오류를 던진다', () => {
  const store = S.createStore(memBackend({ failAfter: 0 }));
  assert.throws(() => store.createMap({ name: 'x', width: 5, height: 5 }), (e) => e.reason === 'quota');
  assert.deepEqual(store.listMeta(), []);
});

test('깨진 저장 데이터는 broken으로 표시되고 지울 수 있다', () => {
  const be = memBackend();
  const store = S.createStore(be);
  const ok = store.createMap({ name: '정상', width: 5, height: 5 });
  be.setItem('pr.map.x', '{깨짐');
  be.setItem('pr.order', JSON.stringify([ok.id, 'x', '키없음']));
  const meta = store.listMeta();
  assert.equal(meta.length, 3);
  assert.deepEqual(meta.map((m) => m.broken), [false, true, true]);
  assert.equal(meta[1].name, '(읽을 수 없는 맵)');
  assert.equal(store.loadMap('x'), null);
  store.deleteMap('x');
  assert.equal(store.listMeta().length, 2);
});

test('깨진 순서 정보여도 listMeta는 빈 목록을 돌려준다', () => {
  const be = memBackend();
  be.setItem('pr.order', 'abc');
  assert.deepEqual(S.createStore(be).listMeta(), []);
});

test('내보내기 → 새 저장소에 불러오기 하면 같은 맵이 된다', () => {
  const src = S.createStore(memBackend());
  completeMap(src, '1번');
  completeMap(src, '2번');
  const text = src.exportAll();
  const dst = S.createStore(memBackend());
  const res = dst.importAll(text);
  assert.deepEqual(res, { ok: true, added: 2 });
  assert.deepEqual(names(dst), ['1번', '2번']);
  const loaded = dst.loadMap(dst.listMeta()[0].id);
  assert.equal(M.placementAt(loaded, 'objects', 1, 1).b, 'wall');
  assert.equal(M.isComplete(loaded), true);
});

test('이미 맵이 있어도 불러오기는 기존 맵을 지우지 않고 새 id로 추가한다', () => {
  const store = S.createStore(memBackend());
  completeMap(store, '원래');
  const text = store.exportAll();
  const res = store.importAll(text);
  assert.equal(res.ok, true);
  assert.deepEqual(names(store), ['원래', '원래']);
  const ids = store.listMeta().map((m) => m.id);
  assert.equal(new Set(ids).size, 2);
});

test('잘못된 파일은 거부되고 저장소는 전혀 바뀌지 않는다', () => {
  const be = memBackend();
  const store = S.createStore(be);
  completeMap(store, '기존');
  const snapshot = JSON.stringify([...be.data.entries()]);
  const good = JSON.parse(store.exportAll());
  const badMap = { ...good, maps: [good.maps[0], { ...good.maps[0], width: 0 }] };
  for (const text of ['아무말', '{}', JSON.stringify({ app: '다른것', version: 1, maps: [] }), JSON.stringify({ app: 'protocol-red', version: 1 }), JSON.stringify(badMap)]) {
    const res = store.importAll(text);
    assert.equal(res.ok, false, text);
    assert.ok(res.message.length > 0);
    assert.equal(JSON.stringify([...be.data.entries()]), snapshot, text);
  }
});

test('불러오던 중 저장이 실패하면 방금 추가한 맵도 되돌린다', () => {
  const src = S.createStore(memBackend());
  completeMap(src, '1번');
  completeMap(src, '2번');
  const text = src.exportAll();
  const be = memBackend({ failAfter: 1 });
  const dst = S.createStore(be);
  const res = dst.importAll(text);
  assert.equal(res.ok, false);
  assert.deepEqual(dst.listMeta(), []);
  assert.equal([...be.data.keys()].filter((k) => k.startsWith('pr.map.')).length, 0);
});
