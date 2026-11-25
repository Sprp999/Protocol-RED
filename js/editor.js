(function () {
  const PR = window.PR;
  const MM = PR.MapModel;
  const VM = PR.ViewMath;
  const $ = (id) => document.getElementById(id);

  function pickBackend() {
    try {
      const t = '__pr_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (e) {
      const mem = new Map();
      return {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: (k) => mem.delete(k),
      };
    }
  }

  const store = PR.Store.createStore(pickBackend(), PR.Blocks.sizeOf);
  const params = new URLSearchParams(location.search);
  const map = params.get('id') ? store.loadMap(params.get('id')) : null;
  if (!map) {
    $('not-found').classList.remove('hidden');
    $('editor-body').classList.add('hidden');
    return;
  }

  const history = PR.History.createHistory(100);
  const canvas = $('map-canvas');
  const ctx = canvas.getContext('2d');
  const state = {
    map,
    view: { scale: 1, x: 0, y: 0 },
    tool: 'brush',
    layer: 'floor',
    blockId: null,
    category: null,
    showGrid: true,
    space: false,
    panning: null,
    stroke: null,
    hover: null,
    fitted: false,
    cssW: 0,
    cssH: 0,
  };
  window.__editor = { getView: () => state.view, getMap: () => state.map };
  $('map-title').textContent = map.name;
  document.title = map.name + ' — Protocol-RED 맵 편집';

  // ---------- 그리기 ----------
  let frame = 0;
  function requestDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }
  function draw() {
    if (!state.cssW) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let ghost = null;
    const block = state.blockId && PR.Blocks.get(state.blockId);
    if (state.tool === 'brush' && block && state.hover && !state.panning) {
      const { x, y } = state.hover;
      ghost = { block, x, y, valid: x >= 0 && y >= 0 && x + block.w <= map.width && y + block.h <= map.height };
    }
    PR.Render.drawMap(ctx, map, state.view, { viewW: state.cssW, viewH: state.cssH, showGrid: state.showGrid, ghost });
    $('zoom-label').textContent = Math.round(state.view.scale * 100) + '%';
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    state.cssW = rect.width;
    state.cssH = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    if (!state.fitted && rect.width > 0) {
      state.view = VM.fitView(map.width, map.height, rect.width, rect.height);
      state.fitted = true;
    }
    requestDraw();
  }
  new ResizeObserver(resizeCanvas).observe($('stage'));

  // ---------- 저장 ----------
  let saveTimer = 0;
  function setStatus(text, error) {
    const s = $('save-status');
    s.textContent = text;
    s.classList.toggle('error', !!error);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const res = store.saveMap(map);
    if (res.ok) {
      setStatus('저장됨', false);
      $('quota-banner').classList.add('hidden');
    } else {
      setStatus('저장 실패 — 전체 내보내기로 백업하세요', true);
      const b = $('quota-banner');
      b.textContent = res.message + ' (맵 목록 화면의 "전체 내보내기"를 눌러 주세요. 지금 화면의 작업은 그대로 있어요.)';
      b.classList.remove('hidden');
    }
  }
  function scheduleSave() {
    setStatus('저장 중…', false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function flushSave() {
    if (saveTimer) saveNow();
  }
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  // ---------- 되돌리기 ----------
  function updateUndoButtons() {
    $('btn-undo').disabled = !history.canUndo();
    $('btn-redo').disabled = !history.canRedo();
  }
  function afterChange() {
    updateUndoButtons();
    scheduleSave();
    requestDraw();
  }
  function undo() {
    if (history.undo(map)) afterChange();
  }
  function redo() {
    if (history.redo(map)) afterChange();
  }
  $('btn-undo').onclick = undo;
  $('btn-redo').onclick = redo;

  // ---------- 팔레트 ----------
  function selectBlock(id) {
    const b = PR.Blocks.get(id);
    if (!b) return;
    state.blockId = id;
    state.layer = b.layer;
    state.category = b.category;
    state.tool = 'brush';
    syncUi();
  }
  function renderPalette() {
    const cats = PR.Blocks.categories(state.layer);
    if (!cats.includes(state.category)) state.category = cats[0] || null;
    const tabs = $('palette-tabs');
    tabs.textContent = '';
    for (const c of cats) {
      const t = document.createElement('button');
      t.className = 'palette-tab' + (c === state.category ? ' active' : '');
      t.textContent = c;
      t.dataset.category = c;
      t.onclick = () => {
        state.category = c;
        renderPalette();
      };
      tabs.appendChild(t);
    }
    const pal = $('palette');
    pal.textContent = '';
    for (const b of PR.Blocks.byLayer(state.layer).filter((x) => x.category === state.category)) {
      const btn = document.createElement('button');
      btn.className = 'palette-block' + (b.id === state.blockId ? ' active' : '');
      btn.dataset.blockId = b.id;
      btn.title = b.name + ' (' + b.w + '×' + b.h + '칸)';
      const sw = document.createElement('div');
      sw.className = 'swatch';
      if (b.file) {
        const img = document.createElement('img');
        img.src = b.file;
        img.alt = b.name;
        sw.appendChild(img);
      } else {
        sw.style.background = b.color;
        sw.textContent = b.name.charAt(0);
      }
      const nm = document.createElement('span');
      nm.className = 'pname';
      nm.textContent = b.name;
      btn.append(sw, nm);
      btn.onclick = () => selectBlock(b.id);
      pal.appendChild(btn);
    }
  }
  function syncUi() {
    const first = PR.Blocks.byLayer(state.layer)[0];
    const cur = state.blockId && PR.Blocks.get(state.blockId);
    if (!cur || cur.layer !== state.layer) {
      state.blockId = first ? first.id : null;
      state.category = first ? first.category : null;
    }
    for (const b of document.querySelectorAll('[data-layer]')) b.classList.toggle('active', b.dataset.layer === state.layer);
    for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === state.tool);
    renderPalette();
    requestDraw();
  }
  for (const b of document.querySelectorAll('[data-layer]')) {
    b.onclick = () => {
      state.layer = b.dataset.layer;
      syncUi();
    };
  }
  for (const b of document.querySelectorAll('[data-tool]')) {
    b.onclick = () => {
      state.tool = b.dataset.tool;
      syncUi();
    };
  }

  // ---------- 화면 이동·확대 ----------
  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function zoomBy(factor, px, py) {
    state.view = VM.zoomAt(state.view, factor, px, py);
    requestDraw();
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = localPoint(e);
    zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });
  $('btn-zoom-in').onclick = () => zoomBy(1.25, state.cssW / 2, state.cssH / 2);
  $('btn-zoom-out').onclick = () => zoomBy(0.8, state.cssW / 2, state.cssH / 2);
  $('btn-fit').onclick = () => {
    state.view = VM.fitView(map.width, map.height, state.cssW, state.cssH);
    requestDraw();
  };
  $('btn-grid').onclick = () => {
    state.showGrid = !state.showGrid;
    $('btn-grid').classList.toggle('active', state.showGrid);
    requestDraw();
  };

  // ---------- 놓기·지우기 ----------
  function applyAt(cell) {
    if (state.tool === 'brush') {
      const b = state.blockId && PR.Blocks.get(state.blockId);
      if (!b) return null;
      return MM.placeBlock(map, b.layer, { id: b.id, w: b.w, h: b.h }, cell.x, cell.y);
    }
    if (state.tool === 'erase') return MM.eraseAt(map, state.layer, cell.x, cell.y);
    return null;
  }
  function strokeTo(cell) {
    const st = state.stroke;
    // 빠르게 끌어도 빈 칸이 생기지 않도록 이전 칸과 이어서 채운다
    const from = st.last || cell;
    const steps = Math.max(Math.abs(cell.x - from.x), Math.abs(cell.y - from.y));
    for (let i = st.last ? 1 : 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const patch = applyAt({
        x: Math.round(from.x + (cell.x - from.x) * t),
        y: Math.round(from.y + (cell.y - from.y) * t),
      });
      if (patch) st.patches.push(patch);
    }
    st.last = cell;
    requestDraw();
  }
  function endStroke() {
    const st = state.stroke;
    state.stroke = null;
    if (!st) return;
    const patch = MM.combinePatches(st.patches);
    if (patch) {
      history.commit(patch);
      afterChange();
    }
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    if (state.space || e.button === 1) {
      state.panning = { x: p.x, y: p.y };
      canvas.classList.add('panning');
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    state.stroke = { patches: [], last: null };
    strokeTo(VM.screenToCell(state.view, p.x, p.y));
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = localPoint(e);
    state.hover = VM.screenToCell(state.view, p.x, p.y);
    if (state.panning) {
      state.view = VM.panBy(state.view, p.x - state.panning.x, p.y - state.panning.y);
      state.panning = { x: p.x, y: p.y };
    } else if (state.stroke) {
      strokeTo(state.hover);
    }
    requestDraw();
  });
  function pointerEnd(e) {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (state.panning) {
      state.panning = null;
      canvas.classList.remove('panning');
      requestDraw();
    }
    endStroke();
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', () => {
    if (!state.stroke && !state.panning) {
      state.hover = null;
      requestDraw();
    }
  });

  // ---------- 키보드 ----------
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      state.space = true;
      e.preventDefault();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') state.space = false;
  });
  window.addEventListener('blur', () => {
    state.space = false;
  });

  PR.Blocks.loadImages(() => {
    renderPalette();
    requestDraw();
  });
  syncUi();
  updateUndoButtons();
  resizeCanvas();
})();
