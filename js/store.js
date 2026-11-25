(function (root) {
  const PR = (root.PR = root.PR || {});

  const ORDER_KEY = 'pr.order';
  const MAP_PREFIX = 'pr.map.';
  const META_PREFIX = 'pr.meta.';
  const BROKEN_NAME = '(읽을 수 없는 맵)';

  function failure(err) {
    const quota = !!err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
    return {
      ok: false,
      reason: quota ? 'quota' : 'error',
      message: quota
        ? '브라우저 저장 공간이 가득 찼어요. 지금 "전체 내보내기"로 파일을 받아 두세요.'
        : '저장하지 못했어요. "전체 내보내기"로 파일을 받아 두세요.',
    };
  }

  function createStore(backend, sizeOf = () => null, layerOf = () => null) {
    const MM = () => root.PR.MapModel;
    const MF = () => root.PR.MapFormat;
    const key = (id) => MAP_PREFIX + id;
    const metaKey = (id) => META_PREFIX + id;

    function readOrder() {
      try {
        const v = JSON.parse(backend.getItem(ORDER_KEY));
        return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
      } catch (e) {
        return [];
      }
    }
    const writeOrder = (ids) => backend.setItem(ORDER_KEY, JSON.stringify(ids));

    function loadMap(id) {
      try {
        const raw = backend.getItem(key(id));
        if (raw === null || raw === undefined) return null;
        return MF().parseMap(JSON.parse(raw), sizeOf, layerOf);
      } catch (e) {
        return null;
      }
    }

    // 큰 맵을 매번 통째로 읽지 않도록, 이름·크기는 맵과 함께 따로 적어 둔다
    function readMeta(id) {
      try {
        const m = JSON.parse(backend.getItem(metaKey(id)));
        if (m && typeof m.name === 'string' && Number.isInteger(m.width) && Number.isInteger(m.height)) return m;
      } catch (e) { /* 아래에서 맵을 직접 읽어 채운다 */ }
      return null;
    }
    function writeMeta(map) {
      try {
        backend.setItem(metaKey(map.id), JSON.stringify({ name: map.name, width: map.width, height: map.height, complete: MM().isComplete(map) }));
      } catch (e) { /* 정보를 못 적어도 맵 저장에는 영향이 없다 */ }
    }

    function listMeta() {
      return readOrder().map((id) => {
        const cached = readMeta(id);
        if (cached && backend.getItem(key(id)) !== null) {
          return { id, name: cached.name, width: cached.width, height: cached.height, complete: !!cached.complete, broken: false };
        }
        const m = loadMap(id);
        if (!m) return { id, name: BROKEN_NAME, width: 0, height: 0, complete: false, broken: true };
        writeMeta(m);
        return { id, name: m.name, width: m.width, height: m.height, complete: MM().isComplete(m), broken: false };
      });
    }

    // 맵으로 만들지 않고 저장된 데이터만 확인해서 돌려준다 (작은 그림용)
    function loadSerialized(id) {
      try {
        const raw = backend.getItem(key(id));
        if (raw === null || raw === undefined) return null;
        const d = JSON.parse(raw);
        if (!d || d.version !== 1 || !Number.isInteger(d.width) || !Number.isInteger(d.height) ||
            !Array.isArray(d.floor) || !Array.isArray(d.objects)) return null;
        return d;
      } catch (e) {
        return null;
      }
    }

    function newId() {
      const used = new Set(readOrder());
      let id;
      do id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      while (used.has(id));
      return id;
    }

    function writeMap(map) {
      backend.setItem(key(map.id), JSON.stringify(MF().serializeMap(map)));
      writeMeta(map);
    }
    function removeMap(id) {
      backend.removeItem(key(id));
      backend.removeItem(metaKey(id));
    }

    function saveMap(map) {
      try {
        const order = readOrder();
        const isNew = !order.includes(map.id);
        writeMap(map);
        if (isNew) {
          try {
            writeOrder([...order, map.id]);
          } catch (e) {
            removeMap(map.id);
            throw e;
          }
        }
        return { ok: true };
      } catch (e) {
        return failure(e);
      }
    }

    function createMap({ name, width, height }) {
      const map = MM().createMap({ id: newId(), name, width, height });
      const res = saveMap(map);
      if (!res.ok) {
        const err = new Error(res.message);
        err.reason = res.reason;
        throw err;
      }
      return map;
    }

    function duplicateMap(id) {
      const src = loadMap(id);
      if (!src) return null;
      const data = MF().serializeMap(src);
      data.id = newId();
      data.name = src.name + ' 복사';
      const copy = MF().parseMap(data, sizeOf, layerOf);
      const order = readOrder();
      try {
        writeMap(copy);
        const at = order.indexOf(id);
        order.splice(at < 0 ? order.length : at + 1, 0, copy.id);
        writeOrder(order);
      } catch (e) {
        removeMap(copy.id);
        const err = new Error(failure(e).message);
        err.reason = failure(e).reason;
        throw err;
      }
      return copy;
    }

    function deleteMap(id) {
      removeMap(id);
      writeOrder(readOrder().filter((x) => x !== id));
    }

    function moveMap(id, newIndex) {
      const order = readOrder();
      const from = order.indexOf(id);
      if (from < 0) return;
      order.splice(from, 1);
      order.splice(Math.max(0, Math.min(order.length, newIndex)), 0, id);
      writeOrder(order);
    }

    function exportAll() {
      const maps = [];
      for (const id of readOrder()) {
        const m = loadMap(id);
        if (m) maps.push(MF().serializeMap(m));
      }
      return JSON.stringify({ app: 'protocol-red', version: 1, maps });
    }

    function importAll(text) {
      let file;
      try {
        file = JSON.parse(text);
      } catch (e) {
        return { ok: false, message: '맵 파일이 아니에요. (읽을 수 없는 내용)' };
      }
      if (!file || file.app !== 'protocol-red' || file.version !== 1 || !Array.isArray(file.maps)) {
        return { ok: false, message: 'Protocol-RED에서 내보낸 맵 파일이 아니에요.' };
      }
      const parsed = [];
      for (let i = 0; i < file.maps.length; i++) {
        try {
          parsed.push(MF().parseMap(file.maps[i], sizeOf, layerOf));
        } catch (e) {
          return { ok: false, message: (i + 1) + '번째 맵을 읽을 수 없어요: ' + e.message };
        }
      }
      const written = [];
      const order = readOrder();
      try {
        const used = new Set(order);
        for (const map of parsed) {
          let id;
          do id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          while (used.has(id));
          used.add(id);
          map.id = id;
          writeMap(map);
          written.push(id);
        }
        writeOrder([...order, ...written]);
      } catch (e) {
        for (const id of written) removeMap(id);
        return failure(e);
      }
      return { ok: true, added: written.length };
    }

    return { listMeta, loadMap, loadSerialized, saveMap, createMap, duplicateMap, deleteMap, moveMap, exportAll, importAll };
  }

  PR.Store = { createStore };
  if (typeof module !== 'undefined') module.exports = PR.Store;
})(typeof globalThis !== 'undefined' ? globalThis : window);
