// 블록 정식 목록. 새 블록은 assets/blocks/ 에 그림을 넣고 여기에 항목을 추가한다.
// color는 맵 목록의 작은 미리보기 등에서 그림 대신 쓰는 대표 색이다.
(function (root) {
  const PR = (root.PR = root.PR || {});
  PR.BLOCK_DEFS = [
    { id: "floor_light_1", name: "연회색 바닥", layer: "floor", category: "바닥", w: 1, h: 1, solid: false, color: "#e5e8ee", file: "assets/blocks/floor_light_1.png" },
    { id: "capsule_1", name: "배양 캡슐", layer: "objects", category: "물건", w: 1, h: 2, solid: true, color: "#679fa2", file: "assets/blocks/capsule_1.png" },
    { id: "panel_1", name: "금속 패널 벽", layer: "walls", category: "벽", w: 1, h: 3, solid: true, color: "#c9ced5", file: "assets/blocks/panel_1.png" },
    { id: "wall_top_1", name: "벽 윗면(천장)", layer: "walls", category: "벽", w: 1, h: 1, solid: true, color: "#d3d7df", file: "assets/blocks/wall_top_1.png" },
  ];
  if (typeof module !== 'undefined') module.exports = PR.BLOCK_DEFS;
})(typeof globalThis !== 'undefined' ? globalThis : window);
