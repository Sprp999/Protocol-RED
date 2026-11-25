(function () {
  const PR = window.PR;

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
  window.__store = store;

  const grid = document.getElementById('map-grid');
  const emptyHint = document.getElementById('empty-hint');
  const quotaBanner = document.getElementById('quota-banner');
  const messageBox = document.getElementById('list-message');
  const THUMB_W = 240, THUMB_H = 160;
  const drawn = new Set();
  let draggingId = null;

  function showBanner(text) {
    quotaBanner.textContent = text;
    quotaBanner.classList.toggle('hidden', !text);
  }
  function showMessage(text, ok) {
    messageBox.textContent = text || '';
    messageBox.classList.toggle('hidden', !text);
    messageBox.classList.toggle('ok', !!ok);
  }
  function guard(fn) {
    try {
      fn();
      showBanner('');
    } catch (e) {
      showBanner(e.message || '저장하지 못했어요. "전체 내보내기"로 파일을 받아 두세요.');
    }
    render();
  }

  function drawThumb(card) {
    const id = card.dataset.id;
    const map = store.loadMap(id);
    const canvas = card.querySelector('canvas');
    if (map && canvas) {
      PR.Render.drawThumbnail(canvas, map);
      drawn.add(id);
    }
  }

  let observer = null;
  function observeCard(card) {
    if (!('IntersectionObserver' in window)) {
      drawThumb(card);
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            drawThumb(en.target);
            observer.unobserve(en.target);
          }
        }
      }, { rootMargin: '200px' });
    }
    observer.observe(card);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildCard(meta, index, total) {
    const card = el('article', 'map-card');
    card.dataset.id = meta.id;
    card.draggable = true;

    const canvas = el('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    card.appendChild(canvas);

    const head = el('div', 'card-head');
    head.appendChild(el('span', 'card-index', String(index + 1)));
    if (meta.broken) {
      head.appendChild(el('span', 'card-name', meta.name));
    } else {
      const a = el('a', 'card-name', meta.name);
      a.href = 'editor.html?id=' + encodeURIComponent(meta.id);
      head.appendChild(a);
    }
    card.appendChild(head);

    const info = el('div', 'card-meta');
    if (meta.broken) {
      info.appendChild(el('span', 'badge badge-broken', '읽을 수 없음'));
    } else {
      info.appendChild(el('span', 'card-size', meta.width + '×' + meta.height + '칸'));
      if (!meta.complete) info.appendChild(el('span', 'badge badge-incomplete', '미완성'));
    }
    card.appendChild(info);

    const actions = el('div', 'card-actions');
    if (!meta.broken) {
      const open = el('a', 'btn-open', '열기');
      open.href = 'editor.html?id=' + encodeURIComponent(meta.id);
      actions.appendChild(open);
      const up = el('button', 'btn-up', '↑');
      up.title = '앞으로';
      up.disabled = index === 0;
      up.onclick = () => guard(() => store.moveMap(meta.id, index - 1));
      const down = el('button', 'btn-down', '↓');
      down.title = '뒤로';
      down.disabled = index === total - 1;
      down.onclick = () => guard(() => store.moveMap(meta.id, index + 1));
      const dup = el('button', 'btn-dup', '복제');
      dup.onclick = () => guard(() => store.duplicateMap(meta.id));
      actions.append(up, down, dup);
    }
    const del = el('button', 'btn-del danger', '삭제');
    del.onclick = () => {
      if (window.confirm('"' + meta.name + '" 맵을 삭제할까요? 되돌릴 수 없어요.')) guard(() => store.deleteMap(meta.id));
    };
    actions.appendChild(del);
    card.appendChild(actions);

    card.addEventListener('dragstart', (e) => {
      draggingId = meta.id;
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', meta.id);
      }
    });
    card.addEventListener('dragend', () => {
      draggingId = null;
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', (e) => {
      if (draggingId && draggingId !== meta.id) {
        e.preventDefault();
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (draggingId && draggingId !== meta.id) {
        const id = draggingId;
        draggingId = null;
        guard(() => store.moveMap(id, index));
      }
    });
    return card;
  }

  function render() {
    const metas = store.listMeta();
    grid.textContent = '';
    drawn.clear();
    if (observer) observer.disconnect();
    emptyHint.classList.toggle('hidden', metas.length > 0);
    metas.forEach((m, i) => {
      const card = buildCard(m, i, metas.length);
      grid.appendChild(card);
      if (!m.broken) observeCard(card);
    });
  }

  function openNewMapDialog() {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.innerHTML =
      '<h2>새 맵 만들기</h2>' +
      '<label for="new-name">이름</label><input type="text" id="new-name">' +
      '<div class="row"><div><label for="new-width">가로(칸)</label><input type="number" id="new-width" value="40"></div>' +
      '<div><label for="new-height">세로(칸)</label><input type="number" id="new-height" value="30"></div></div>' +
      '<div class="error" id="new-error"></div>' +
      '<div class="actions"><button id="new-cancel">취소</button><button id="new-ok" class="primary">만들기</button></div>';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const nameInput = modal.querySelector('#new-name');
    nameInput.value = '새 맵 ' + (store.listMeta().length + 1);
    nameInput.focus();
    nameInput.select();
    const close = () => backdrop.remove();
    modal.querySelector('#new-cancel').onclick = close;
    modal.querySelector('#new-ok').onclick = () => {
      const err = modal.querySelector('#new-error');
      const w = Number(modal.querySelector('#new-width').value);
      const h = Number(modal.querySelector('#new-height').value);
      const max = PR.MapModel.MAX_SIZE;
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > max || h > max) {
        err.textContent = '가로·세로는 1~' + max + ' 사이의 정수로 입력하세요.';
        return;
      }
      const name = nameInput.value.trim() || '새 맵 ' + (store.listMeta().length + 1);
      close();
      guard(() => store.createMap({ name, width: w, height: h }));
    };
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector('#new-ok').click();
      if (e.key === 'Escape') close();
    });
  }

  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  document.getElementById('btn-new-map').onclick = openNewMapDialog;
  document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'protocol-red-maps-' + dateStamp() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importInput = document.getElementById('input-import');
  importInput.onchange = async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    const res = store.importAll(await file.text());
    if (res.ok) {
      showMessage('맵 ' + res.added + '개를 불러왔어요.', true);
      showBanner('');
    } else {
      showMessage(res.message, false);
    }
    render();
  };

  PR.Blocks.loadImages(() => {
    for (const card of grid.querySelectorAll('.map-card')) if (drawn.has(card.dataset.id)) drawThumb(card);
  });
  render();
})();
