(function (root) {
  const PR = (root.PR = root.PR || {});

  const images = new Map();
  const defs = () => root.PR.BLOCK_DEFS || [];

  function all() {
    return defs();
  }
  function get(id) {
    return defs().find((b) => b.id === id) || null;
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
    return defs().filter((b) => b.layer === layer);
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
  function setImage(id, img) {
    const canMake = typeof document !== 'undefined' && document.createElement;
    images.set(id, buildLevels(img, canMake ? browserCanvas : null));
  }
  function image(id) {
    const levels = images.get(id);
    return levels ? levels[0].src : null;
  }
  function imageFor(id, targetW) {
    const levels = images.get(id);
    return levels ? pickLevel(levels, targetW) : null;
  }
  function levelsOf(id) {
    return images.get(id) || [];
  }
  // 그림 파일이 있는 블록의 그림을 불러온다. 하나 불러올 때마다 onChange가 불린다.
  function loadImages(onChange) {
    for (const b of defs()) {
      if (!b.file || images.has(b.id)) continue;
      const img = new Image();
      img.onload = () => {
        setImage(b.id, img);
        if (onChange) onChange();
      };
      img.src = b.file;
    }
  }

  PR.Blocks = { all, get, sizeOf, layerOf, byLayer, categories, image, imageFor, levelsOf, setImage, buildLevels, pickLevel, loadImages };
  if (typeof module !== 'undefined') module.exports = PR.Blocks;
})(typeof globalThis !== 'undefined' ? globalThis : window);
