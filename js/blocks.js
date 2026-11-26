(function (root) {
  const PR = (root.PR = root.PR || {});

  const images = new Map();
  const defs = () => root.PR.BLOCK_DEFS || [];
  // 에디터에서만 쓰는 표시. 게임용 블록 목록(data/blocks.js)에는 넣지 않고, 맵의 시작점(start) 값으로 저장된다.
  const EDITOR_DEFS = [
    { id: 'start_flag', name: '시작 깃발', layer: 'start', category: '시작점', w: 1, h: 1, solid: false, color: '#e5483c', file: 'assets/editor/start_flag.png' },
  ];
  const allDefs = () => defs().concat(EDITOR_DEFS);

  function all() {
    return defs();
  }
  function get(id) {
    return allDefs().find((b) => b.id === id) || null;
  }
  function sizeOf(id) {
    const b = get(id);
    return b ? { w: b.w, h: b.h } : null;
  }
  function layerOf(id) {
    const b = get(id);
    return b ? b.layer : null;
  }
  function byLayer(layer) {
    return allDefs().filter((b) => b.layer === layer);
  }
  function categories(layer) {
    const out = [];
    for (const b of byLayer(layer)) if (!out.includes(b.category)) out.push(b.category);
    return out;
  }
  // 큰 그림을 절반씩 줄인 단계(밉맵)를 만들어 둔다. 화면 크기에 맞는 단계를 골라 쓰면
  // 아주 큰 원본 그림도 작게 줄여 그릴 때 깨지거나 점무늬가 생기지 않는다.
  function buildLevels(img, makeCanvas) {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const levels = [{ src: img, w: w0, h: h0 }];
    if (!makeCanvas) return levels;
    let cur = levels[0];
    while (cur.w >= 32 && cur.h >= 32) {
      const w = Math.max(1, Math.round(cur.w / 2));
      const h = Math.max(1, Math.round(cur.h / 2));
      const cv = makeCanvas(w, h);
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur.src, 0, 0, cur.w, cur.h, 0, 0, w, h);
      cur = { src: cv, w, h };
      levels.push(cur);
    }
    return levels;
  }
  // 필요한 가로 크기보다 크거나 같은 단계 중 가장 작은 것 (없으면 원본)
  function pickLevel(levels, targetW) {
    let best = levels[0];
    for (const l of levels) if (l.w >= targetW) best = l;
    return best;
  }
  function browserCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  // 등록한 그림. 애니메이션 블록은 시트를 프레임 한 장씩 잘라서 프레임마다 단계별로 줄인 그림(levels)을 가진다.
  // images: 블록 id → { frames: [levels, levels, ...] }  (일반 블록은 프레임이 한 장)
  function setImage(id, img, factory) {
    const make = factory || (typeof document !== 'undefined' && document.createElement ? browserCanvas : null);
    const def = get(id);
    const anim = def && def.anim;
    if (anim && make) {
      const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
      const fw = Math.floor(sw / anim.cols), fh = Math.floor(sh / anim.rows);
      const frames = [];
      for (let k = 0; k < anim.frames; k++) {
        const cv = make(fw, fh);
        cv.getContext('2d').drawImage(img, (k % anim.cols) * fw, Math.floor(k / anim.cols) * fh, fw, fh, 0, 0, fw, fh);
        frames.push(buildLevels(cv, make));
      }
      images.set(id, { frames });
      return;
    }
    images.set(id, { frames: [buildLevels(img, make)] });
  }
  function image(id) {
    const e = images.get(id);
    return e ? e.frames[0][0].src : null;
  }
  function imageFor(id, targetW, frame = 0) {
    const e = images.get(id);
    if (!e) return null;
    return pickLevel(e.frames[((frame % e.frames.length) + e.frames.length) % e.frames.length], targetW);
  }
  function levelsOf(id) {
    const e = images.get(id);
    return e ? e.frames[0] : [];
  }
  function frameCount(id) {
    const def = get(id);
    return def && def.anim ? def.anim.frames : 1;
  }
  function animFpsOf(id) {
    const def = get(id);
    return def && def.anim ? def.anim.fps : 0;
  }
  // 지금 시각(ms)에 보여줄 프레임 번호. 시간이 같으면 언제나 같은 프레임이다.
  function frameAt(id, timeMs) {
    const def = get(id);
    if (!def || !def.anim) return 0;
    return Math.floor((timeMs * def.anim.fps) / 1000) % def.anim.frames;
  }
  // 그림 파일이 있는 블록의 그림을 불러온다. 하나 불러올 때마다 onChange가 불린다.
  function loadImages(onChange) {
    for (const b of allDefs()) {
      if (!b.file || images.has(b.id)) continue;
      const img = new Image();
      img.onload = () => {
        setImage(b.id, img);
        if (onChange) onChange();
      };
      img.src = b.file;
    }
  }

  PR.Blocks = { all, get, sizeOf, layerOf, byLayer, categories, image, imageFor, levelsOf, frameCount, animFpsOf, frameAt, setImage, buildLevels, pickLevel, loadImages };
  if (typeof module !== 'undefined') module.exports = PR.Blocks;
})(typeof globalThis !== 'undefined' ? globalThis : window);
