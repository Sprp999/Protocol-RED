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
  function byLayer(layer) {
    return defs().filter((b) => b.layer === layer);
  }
  function categories(layer) {
    const out = [];
    for (const b of byLayer(layer)) if (!out.includes(b.category)) out.push(b.category);
    return out;
  }
  function image(id) {
    return images.get(id) || null;
  }
  // 그림 파일이 있는 블록의 그림을 불러온다. 하나 불러올 때마다 onChange가 불린다.
  function loadImages(onChange) {
    for (const b of defs()) {
      if (!b.file || images.has(b.id)) continue;
      const img = new Image();
      img.onload = () => {
        images.set(b.id, img);
        if (onChange) onChange();
      };
      img.src = b.file;
    }
  }

  PR.Blocks = { all, get, sizeOf, byLayer, categories, image, loadImages };
  if (typeof module !== 'undefined') module.exports = PR.Blocks;
})(typeof globalThis !== 'undefined' ? globalThis : window);
