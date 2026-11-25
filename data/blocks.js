// 블록 정식 목록. 새 블록은 assets/blocks/ 에 그림을 넣고 여기에 항목을 추가한다.
// file이 없는 항목은 color 색깔 칸으로 그려지는 임시 블록이다.
(function (root) {
  const PR = (root.PR = root.PR || {});
  PR.BLOCK_DEFS = [
    { id: "floor_light_1", name: "연회색 바닥", layer: "floor", category: "바닥", w: 1, h: 1, solid: false, color: "#e5e8ee", file: "assets/blocks/floor_light_1.png" },
    { id: 'tmp_floor_gray', name: '회색 바닥(임시)', layer: 'floor', category: '바닥', w: 1, h: 1, solid: false, color: '#4a4a4a' },
    { id: 'tmp_floor_dirt', name: '흙 바닥(임시)', layer: 'floor', category: '바닥', w: 1, h: 1, solid: false, color: '#6b4a2b' },
    { id: 'tmp_wall', name: '벽(임시)', layer: 'objects', category: '벽', w: 1, h: 1, solid: true, color: '#8a8a99' },
    { id: 'tmp_crate', name: '상자(임시)', layer: 'objects', category: '물건', w: 1, h: 1, solid: true, color: '#a8742f' },
    { id: 'tmp_house', name: '건물(임시 3x2)', layer: 'objects', category: '건물', w: 3, h: 2, solid: true, color: '#a33a3a' },
  ];
  if (typeof module !== 'undefined') module.exports = PR.BLOCK_DEFS;
})(typeof globalThis !== 'undefined' ? globalThis : window);
