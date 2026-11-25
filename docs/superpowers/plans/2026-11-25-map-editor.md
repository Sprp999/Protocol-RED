# 맵 제작 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검은 배경 위에 블록을 배치해 2D 탑다운 게임 맵을 만들고, 맵 수십 개를 순서대로 관리하는 브라우저 도구를 만든다.

**Architecture:** 설치 없이 `index.html`을 더블클릭하면(file://) 동작하는 순수 HTML/CSS/JS. 맵 계산(배치·되돌리기·저장 형식·화면 변환)은 화면과 분리된 작은 파일들로 만들어 Node에서 단위 테스트하고, 화면(맵 목록·편집기)은 Playwright(브라우저 자동 조작)로 검증한다. 맵은 일반 JSON 형식으로 저장·내보내기 되어 나중에 어떤 게임 프로그램에서도 읽을 수 있다.

**Tech Stack:** HTML5 Canvas, 바닐라 JavaScript(빌드 도구 없음), Node 내장 테스트(`node --test`), Playwright(이미 전역 설치됨), 블록 등록 도구에만 `pngjs`.

**Spec:** `docs/superpowers/specs/2026-11-25-map-editor-design.md`

## Global Constraints

- 한 칸은 64×64 픽셀(`tileSize: 64`). 맵 기본 40×30칸, 최대 200×200칸.
- 층은 `floor`(바닥), `objects`(물건) 두 개. 한 층에서 블록끼리는 겹치지 않는다.
- 확대·축소는 4%~400%. 되돌리기는 최소 50단계(구현은 100단계).
- 화면은 검은 배경. 픽셀 그림은 번지지 않게(`imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`).
- 화면 글자는 모두 한국어. 맵 삭제와 칸 줄이기로 내용이 잘리는 경우는 반드시 확인 창을 거친다.
- 서버·설치 없이 file://로 열려야 한다. 따라서 `<script type="module">`, `fetch`, JSON 파일 직접 읽기는 쓰지 않는다. **스펙 7장의 `data/blocks.json`은 같은 이유로 `data/blocks.js`로 바꾼다**(Task 6에서 스펙도 고친다).
- 모든 `js/*.js`는 아래 형태를 따른다(브라우저와 Node 양쪽에서 동작). 다른 모듈은 호출 시점에 `root.PR.<이름>`으로 접근한다.

```js
(function (root) {
  const PR = (root.PR = root.PR || {});
  PR.Name = { /* ... */ };
  if (typeof module !== 'undefined') module.exports = PR.Name;
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- 맵 저장 형식: `version: 1`. 브라우저 저장 키는 `pr.order`, `pr.map.<id>`.

## Review Focus

사용자가 부딪힐 가능성이 큰 순서. 각 항목의 테스트는 표시한 Task에 들어 있다.

1. 브라우저 저장 공간이 가득 차 저장이 실패 → 작업은 메모리에 유지하고, 눈에 띄는 경고와 내보내기 안내를 보인다 (Task 5, Task 8a).
2. 깨졌거나 다른 종류의 파일을 불러오기 → 이유를 알려주고 기존 맵은 건드리지 않는다 (Task 2, Task 5).
3. 칸을 줄여서 이미 놓은 블록이 잘리게 됨 → 몇 개가 사라지는지 알려주고 확인을 받는다 (Task 8b).
4. 여러 칸 구조물이 맵 가장자리에 걸치거나 다른 블록과 겹침 → 가장자리는 놓이지 않고, 겹친 것은 통째로 대체된다 (Task 1).
5. 블록 목록에서 빠진/없는 블록 id가 맵에 남아 있음 → 맵이 열리고, 그 칸은 분홍색 "?"로 보인다 (Task 2, Task 6).

---

## File Structure

| 파일 | 역할 |
|---|---|
| `package.json` | 실행 명령(`test`, `test:e2e`), `pngjs` 개발용 의존성 |
| `js/mapmodel.js` | 맵 데이터와 배치 규칙, 변경 기록(패치) |
| `js/mapformat.js` | 맵 ↔ JSON 변환과 검증 |
| `js/history.js` | 되돌리기/다시하기 |
| `js/viewmath.js` | 확대·이동·칸 좌표 계산 |
| `js/store.js` | 브라우저 저장, 순서, 복제·삭제, 내보내기/불러오기 |
| `data/blocks.js` | 블록 목록(정식 목록, 처음엔 임시 블록) |
| `js/blocks.js` | 블록 목록 조회와 그림 불러오기 |
| `js/render.js` | 캔버스에 맵 그리기, 썸네일 |
| `index.html`, `js/maplist.js` | 맵 목록 페이지 |
| `editor.html`, `js/editor.js` | 맵 편집 페이지 |
| `css/style.css` | 공통 스타일(어두운 톤) |
| `tools/slice-sheet.js` | 격자 그림 자르기·검사 (Claude가 블록 등록할 때 사용) |
| `tests/unit/*.test.js`, `tests/e2e/*.test.js`, `tests/e2e/helpers.js` | 테스트 |

---

### Task 1: 맵 데이터와 배치 규칙

**Files:**
- Create: `package.json`, `.gitignore`(`node_modules/`), `js/mapmodel.js`, `tests/unit/mapmodel.test.js`

**Interfaces:**
- Produces (`PR.MapModel`):
  - 타입 `Placement = {uid:number, b:string, x:number, y:number, w:number, h:number}`, `Layer = 'floor'|'objects'`
  - `MapData = {version:1, id:string, name:string, width:number, height:number, tileSize:64, layers:{floor:Placement[], objects:Placement[]}, start:{x,y}|null, exits:{x,y}[], nextUid:number}` (칸 조회용 숨은 색인을 가지며 저장 대상 아님)
  - `Patch = {ops: Op[]}`, `Op = {t:'place', layer, removed:Placement[], added:Placement[]} | {t:'start', from, to} | {t:'exits', from:{x,y}[], to:{x,y}[]}`
  - `createMap({id, name, width, height}) -> MapData` (정수 1~200이 아니면 `RangeError`)
  - `placeBlock(map, layer, block:{id,w,h}, x, y) -> Patch|null`
  - `eraseAt(map, layer, x, y) -> Patch|null`
  - `fillRect(map, layer, block, x0, y0, x1, y1) -> Patch|null`, `eraseRect(map, layer, x0, y0, x1, y1) -> Patch|null`
  - `toggleStart(map, x, y) -> Patch|null`, `toggleExit(map, x, y) -> Patch|null`
  - `applyPatch(map, patch)`, `revertPatch(map, patch)`, `combinePatches(patches) -> Patch|null`
  - `placementAt(map, layer, x, y) -> Placement|null`, `countPlacements(map) -> number`, `isComplete(map) -> boolean`
  - `resizeMap(map, width, height) -> MapData`(새 객체), `countDroppedByResize(map, width, height) -> number`

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/unit/mapmodel.test.js`, `node:test` + `assert`)
  - `createMap`: 40×30 생성 시 두 층이 비어 있고 `tileSize===64`; 0×5, 201×5, 3.5×5는 `RangeError`.
  - `placeBlock`: 1×1을 (3,4)에 놓으면 `placementAt(...)`가 그 블록을 돌려줌; 범위 밖 `(-1,0)`·`(40,0)`은 `null`; 같은 블록을 같은 자리에 또 놓으면 `null`(변화 없음).
  - 3×2 블록(`{id:'house',w:3,h:2}`)을 (38,0)에 놓으면 `null`(가장자리에 걸침); (37,0)이면 성공하고 `placementAt`이 (37..39, 0..1) 여섯 칸 모두에서 같은 `uid`를 돌려줌.
  - 겹침: 3×2 위에 1×1을 (38,1)에 놓으면 3×2 전체가 사라지고(`removed.length===1`) 1×1만 남음. 다른 층(`floor`)의 같은 칸은 영향 없음.
  - `eraseAt`: 3×2의 한 칸을 지우면 구조물 전체가 사라짐; 빈 칸이면 `null`.
  - `fillRect`: 1×1로 (2,2)~(5,4) 채우면 12개; 3×2 블록으로 (0,0)~(5,3)을 채우면 4개(2×2 스탬프); 모서리를 거꾸로 줘도(x0>x1) 같은 결과.
  - `eraseRect`: 사각형에 걸친 구조물은 통째로 지워짐.
  - 표시: `toggleStart`로 시작 지점을 놓고, 다른 칸에 또 하면 이동(하나만 유지), 같은 칸에 또 하면 제거. `toggleExit`는 여러 개 가능, 같은 칸에 또 하면 제거. 범위 밖은 `null`.
  - `isComplete`: 시작 지점과 출구 1개 이상이 있어야 `true`.
  - 패치: 임의의 연산 후 `revertPatch`하면 `JSON.stringify(layers/start/exits)`가 연산 전과 같고, `applyPatch`로 다시 적용하면 연산 후와 같음(위의 모든 연산 종류에 대해). `combinePatches([p1,p2])`를 되돌리면 둘 다 원상 복구. `placementAt`도 되돌린 뒤 정확해야 함(색인 일치).
  - `resizeMap`/`countDroppedByResize`: 40×30에서 (39,29)에 1×1, (37,0)에 3×2, 출구 (39,29)를 놓은 뒤 20×20으로 줄이면 3개가 잘림(`count===3`)이고 결과 맵에는 남지 않음; 늘리면 0.

- [ ] **Step 2: 실패 확인** — `node --test tests/unit/mapmodel.test.js` → `Cannot find module`로 FAIL.
- [ ] **Step 3: 구현** — 위 시그니처대로 `js/mapmodel.js`. 칸 조회는 층마다 `Int32Array(width*height)`(비면 -1)에 배치의 순번을 넣는 숨은 색인으로 O(1)이 되게 하고, `applyPatch`/`revertPatch`/`resizeMap`이 색인을 항상 맞춘다. `package.json`에 `"test": "node --test tests/unit/"`, `"test:e2e": "node --test tests/e2e/"`.
- [ ] **Step 4: 통과 확인** — `npm test` → 전부 PASS.
- [ ] **Step 5: 커밋** — `git add package.json .gitignore js/mapmodel.js tests/unit/mapmodel.test.js && git commit -m "맵 데이터와 배치 규칙 추가"`

---

### Task 2: 맵 저장 형식

**Files:**
- Create: `js/mapformat.js`, `tests/unit/mapformat.test.js`

**Interfaces:**
- Consumes: `PR.MapModel.createMap`, `placeBlock`
- Produces (`PR.MapFormat`):
  - `serializeMap(map) -> object` : `{version:1, id, name, width, height, tileSize:64, floor:[[blockId,x,y,n],...], objects:[...], start:{x,y}|null, exits:[{x,y},...]}`. 같은 블록이 같은 줄에서 블록 너비 간격으로 이어지면 `n`개를 한 항목으로 묶는다(칸 수가 많은 바닥이 작게 저장됨). y→x 순으로 정렬.
  - `parseMap(data, sizeOf) -> MapData` — `sizeOf(blockId) -> {w,h}|null`(null이면 1×1). 규칙을 어기면 `MapFormatError`(한국어 `message`).
  - `class MapFormatError extends Error`

- [ ] **Step 1: 실패하는 테스트 작성**
  - 왕복: 바닥 가득 + 물건 몇 개 + 3×2 구조물 + 시작/출구가 있는 맵을 `serialize→JSON 문자열→parse`하면 칸별 내용·시작·출구가 같음.
  - 압축: 200×200을 한 블록으로 가득 채운 `floor`는 항목이 200개(줄당 1개)이고 `JSON.stringify(...).length < 10000`.
  - 오류(전부 `MapFormatError`이고 메시지가 비어 있지 않음): `null`, 문자열, 배열, `version: 2`, `width: 0`, `width: 201`, 항목이 숫자 4개가 아님, 좌표가 소수·음수, 항목이 맵 밖으로 나감, `exits`가 배열이 아님.
  - 없는 블록: `sizeOf`가 `null`을 돌려주는 id도 읽히고(1×1로) 그 id가 그대로 유지됨. 파일 안에서 겹치는 항목은 뒤에 온 것이 이긴다.
- [ ] **Step 2: 실패 확인** — `node --test tests/unit/mapformat.test.js` → FAIL.
- [ ] **Step 3: 구현** — `js/mapformat.js`. `parseMap`은 `createMap`+`placeBlock`을 재사용한다.
- [ ] **Step 4: 통과 확인** — `npm test` → PASS.
- [ ] **Step 5: 커밋** — `git commit -m "맵 저장 형식 추가"` (파일 add 포함)

---

### Task 3: 되돌리기/다시하기

**Files:**
- Create: `js/history.js`, `tests/unit/history.test.js`

**Interfaces:**
- Consumes: `PR.MapModel.applyPatch`, `revertPatch`
- Produces (`PR.History`): `createHistory(limit = 100) -> {commit(patch), undo(map) -> boolean, redo(map) -> boolean, canUndo() -> boolean, canRedo() -> boolean, clear()}`

- [ ] **Step 1: 실패하는 테스트 작성** — 새 기록은 `canUndo/canRedo` 모두 false; `commit(p)` 후 `undo(map)`는 true이고 맵이 되돌아가며 `canRedo`가 true; `redo`로 복구; 되돌린 뒤 새 `commit`을 하면 `canRedo`가 false; `commit(null)`과 `ops`가 빈 패치는 무시; 150번 commit 후 undo를 반복하면 정확히 100번 성공하고 101번째는 false(`limit=100`); `clear()` 후 둘 다 false.
- [ ] **Step 2: 실패 확인** — `node --test tests/unit/history.test.js` → FAIL.
- [ ] **Step 3: 구현** — `js/history.js`. `commit`은 패치가 이미 맵에 적용된 뒤에 호출된다는 약속(적용은 호출자가 한다).
- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `git commit -m "되돌리기 기록 추가"`

---

### Task 4: 화면 변환 계산

**Files:**
- Create: `js/viewmath.js`, `tests/unit/viewmath.test.js`

**Interfaces:**
- Produces (`PR.ViewMath`): 상수 `MIN_SCALE=0.04`, `MAX_SCALE=4`, `TILE=64`. `View = {scale:number, x:number, y:number}` (`x,y`는 맵 왼쪽 위 모서리의 화면 위치(px), 한 칸의 화면 크기는 `64*scale`).
  - `fitView(mapW, mapH, viewW, viewH, margin = 24) -> View` (맵 전체가 가운데에 들어옴, `MAX_SCALE` 초과 안 함)
  - `zoomAt(view, factor, px, py) -> View` (화면의 (px,py) 아래 맵 지점이 그대로, 배율은 4%~400%로 제한)
  - `panBy(view, dx, dy) -> View`
  - `screenToCell(view, px, py) -> {x:number, y:number}` (내림, 맵 밖이면 음수/큰 값도 그대로)
  - `visibleCellRange(view, viewW, viewH, mapW, mapH) -> {x0,y0,x1,y1}` (포함 범위, 맵 범위로 제한, 완전히 밖이면 `x1<x0`)

- [ ] **Step 1: 실패하는 테스트 작성** — `fitView(200,200,1000,800)`에서 맵 네 모서리가 화면 안에 마진을 두고 들어오고 중앙 정렬; `fitView(1,1,1000,800).scale===4`; `zoomAt`을 `(300,200)`에서 여러 번 해도 `screenToCell`로 본 그 지점의 맵 좌표가 변하지 않음; 0.01배를 거듭 곱해도 scale≥0.1, 100배도 ≤4; `screenToCell({scale:1,x:0,y:0},64,128)`은 `{x:1,y:2}`, `(-1,0)`은 `{x:-1,y:0}`; `visibleCellRange`가 40×30 맵을 100% 배율로 800×600 화면에서 보면 `x1===12`(포함), 맵보다 크게 이동하면 범위가 맵 안으로 제한됨.
- [ ] **Step 2: 실패 확인** — `node --test tests/unit/viewmath.test.js` → FAIL.
- [ ] **Step 3: 구현** — `js/viewmath.js`.
- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `git commit -m "화면 변환 계산 추가"`

---

### Task 5: 브라우저 저장·순서·내보내기

**Files:**
- Create: `js/store.js`, `tests/unit/store.test.js`

**Interfaces:**
- Consumes: `PR.MapModel.createMap`, `PR.MapFormat.serializeMap/parseMap`, `MapFormatError`
- Produces (`PR.Store`): `createStore(backend, sizeOf = () => null)`, `backend = {getItem(k), setItem(k,v), removeItem(k)}` (브라우저에서는 `localStorage`).
  - `listMeta() -> {id, name, width, height, complete:boolean, broken:boolean}[]` (순서대로. 읽을 수 없는 맵은 `broken:true`, `name:'(읽을 수 없는 맵)'`)
  - `loadMap(id) -> MapData|null`
  - `saveMap(map) -> {ok:true} | {ok:false, reason:'quota'|'error', message:string}`
  - `createMap({name, width, height}) -> MapData` (id는 `m`+시간+난수, 저장되어 순서 끝에 추가)
  - `duplicateMap(id) -> MapData|null` (이름 뒤에 " 복사", 원본 바로 뒤에 삽입)
  - `deleteMap(id)`, `moveMap(id, newIndex)`
  - `exportAll() -> string` (`{app:'protocol-red', version:1, maps:[serialized,...]}`의 JSON, 순서대로)
  - `importAll(text) -> {ok:true, added:number} | {ok:false, message:string}` (**기존 맵은 지우지 않고** 새 id로 뒤에 추가; 파일 전체를 먼저 검증하고, 저장 도중 실패하면 방금 추가한 맵을 되돌린다)

- [ ] **Step 1: 실패하는 테스트 작성** — 메모리로 만든 가짜 `backend`로:
  - `createMap`→`loadMap` 왕복; `listMeta` 순서; `moveMap`/`duplicateMap`(원본 바로 뒤, 이름에 "복사")/`deleteMap` 후 순서와 `loadMap`이 맞음; `deleteMap`이 `pr.map.<id>` 키도 지움.
  - 시작·출구가 있는 맵의 `complete===true`, 없으면 false.
  - **저장 실패(Review Focus 1)**: `setItem`이 `DOMException('...','QuotaExceededError')`를 던지는 가짜로 `saveMap`하면 `{ok:false, reason:'quota'}`이고 예외가 밖으로 새지 않으며 이전에 저장된 내용은 그대로.
  - **깨진 저장 데이터**: `pr.map.x`에 `'{깨짐'`을 넣고 `pr.order`에 x를 넣으면 `listMeta`가 예외 없이 `broken:true`로 표시하고 `loadMap('x')`는 `null`; 그 맵을 `deleteMap`으로 지울 수 있다.
  - **불러오기(Review Focus 2)**: `exportAll`→새 빈 store에 `importAll` 하면 맵 수·이름·순서·내용이 같음; 이미 맵이 있는 store에 다시 불러오면 기존 맵 유지 + 추가(총합이 늘어남, id는 모두 서로 다름); `'아무말'`, `'{}'`, `{app:'다른것'}`, 맵 하나가 형식 오류인 파일은 `{ok:false, message}`이고 store 내용이 전혀 변하지 않음; 두 번째 맵 저장에서 `setItem`이 실패하도록 한 가짜로 불러오면 `{ok:false}`이고 첫 번째 맵도 추가되지 않음(되돌림).
- [ ] **Step 2: 실패 확인** — `node --test tests/unit/store.test.js` → FAIL.
- [ ] **Step 3: 구현** — `js/store.js`. 키는 `pr.order`(id 배열의 JSON)와 `pr.map.<id>`(serialize한 JSON). 맵 하나를 바꿀 때 그 키만 다시 쓴다.
- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `git commit -m "브라우저 저장과 내보내기 추가"`

---

### Task 6: 블록 목록과 맵 그리기

**Files:**
- Create: `data/blocks.js`, `js/blocks.js`, `js/render.js`, `css/style.css`, `tests/unit/blocks.test.js`, `tests/e2e/helpers.js`
- Modify: `docs/superpowers/specs/2026-11-25-map-editor-design.md` (7장의 `data/blocks.json`을 `data/blocks.js`로, 이유 한 줄)

**Interfaces:**
- Produces:
  - `data/blocks.js` → `PR.BLOCK_DEFS = [{id, name, layer:'floor'|'objects', category:string, w:number, h:number, solid:boolean, color:'#rrggbb', file?:string}]`. 처음엔 `file` 없는 임시 블록: `tmp_floor_gray`(바닥/회색), `tmp_floor_dirt`(바닥/갈색), `tmp_wall`(물건·벽/막힘), `tmp_crate`(물건·상자/막힘), `tmp_house`(물건·건물, 3×2, 막힘).
  - `PR.Blocks`(`js/blocks.js`): `all()`, `get(id) -> def|null`, `sizeOf(id) -> {w,h}|null`, `byLayer(layer) -> def[]`, `categories(layer) -> string[]`, `loadImages(onChange: () => void)`(그림을 불러올 때마다 `onChange` 호출), `image(id) -> HTMLImageElement|null`
  - `PR.Render.drawMap(ctx, map, view, opts) -> {drawn:number}`, `opts = {viewW, viewH, showGrid:boolean, ghost?:{block, x, y, valid:boolean}}`; `PR.Render.drawThumbnail(canvas, map)` (맵 전체가 캔버스에 맞게, 격자 없이)
  - `tests/e2e/helpers.js`: `launch() -> {browser, page}`(Playwright chromium, 매 테스트 새 브라우저 컨텍스트), `pageUrl(name) -> 'file://…/<name>'`, `cellToScreen(page, x, y) -> {x,y}`(캔버스 안 해당 칸 가운데 화면 좌표, `window.__editor.getView()` 사용)

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/unit/blocks.test.js`) — `PR.BLOCK_DEFS`의 모든 id가 유일하고, 모든 항목이 `w,h`≥1 정수·`layer`가 두 값 중 하나·`color`가 `#rrggbb`; `get('tmp_house')`가 3×2; `sizeOf('없는것')`은 null; `byLayer('floor')`에 `layer==='objects'`인 블록이 없음.
- [ ] **Step 2: 실패 확인** — `node --test tests/unit/blocks.test.js` → FAIL.
- [ ] **Step 3: 구현** — 블록 목록과 조회. `Render.drawMap`: 검은 배경 전체를 칠하고, 맵 영역은 아주 약간 밝은 어두운 색(`#111`)과 테두리로 구분, 보이는 칸만 순회(`visibleCellRange`)해 바닥→물건 순으로 그린다. 한 칸이 화면에서 6px 미만이면 그림 대신 블록의 `color` 사각형으로 그린다. 그림이 없거나 아직 로딩 중이면 `color` 사각형, **목록에 없는 블록 id는 분홍색 `?` 칸**(Review Focus 5). 시작 지점은 초록 "S", 출구는 빨강 "E" 표시. 한 칸이 8px 이상이고 `showGrid`면 격자선. `ghost`는 반투명 미리보기(`valid:false`면 빨갛게). 반환값 `drawn`은 실제로 그린 배치 수.
- [ ] **Step 4: 통과 확인** — `npm test`. 화면 쪽은 Task 7에서 같이 확인한다.
- [ ] **Step 5: 커밋** — `git commit -m "블록 목록과 맵 그리기 추가"`

---

### Task 7: 맵 목록 페이지

**Files:**
- Create: `index.html`, `js/maplist.js`, `tests/e2e/maplist.test.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `PR.Store`, `PR.Render.drawThumbnail`, `PR.Blocks`
- Produces (화면 요소, 테스트와 이후 Task가 쓴다): `#btn-new-map`(누르면 이름·가로·세로 입력 창, 기본 "새 맵 N"·40·30, 200 초과/1 미만은 입력 오류 표시), `#btn-export`, `#input-import`(파일 선택), `.map-card[data-id]`(번호 `.card-index`, 이름 `.card-name`, 크기 `.card-size`, 썸네일 `canvas`, 미완성이면 `.badge-incomplete` "미완성"), 카드 안 버튼 `.btn-open`, `.btn-dup`, `.btn-del`, `.btn-up`, `.btn-down`, 카드 끌어서 순서 바꾸기, 읽을 수 없는 맵 카드에는 `.badge-broken`과 삭제 버튼만. 열기는 `editor.html?id=<id>`로 이동. 저장 실패 시 `#quota-banner`.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/e2e/maplist.test.js`, file:// 로 `index.html` 열기)
  - 처음엔 카드 0개와 안내 문구. `#btn-new-map`으로 "지하창고" 30×20 만들기 → 카드 1개, 이름·"30×20" 표시, `.badge-incomplete` 있음.
  - 3개 만든 뒤 `.btn-down`/`.btn-up`으로 순서 변경하고 새로고침해도 유지(번호가 1,2,3으로 다시 매겨짐). 카드를 다른 카드 위로 끌어놓으면(`dragTo`) 순서가 바뀜.
  - `.btn-dup`: 원본 바로 뒤에 "… 복사". `.btn-del`: 확인 창(`page.on('dialog')`)에서 취소하면 그대로, 수락하면 사라짐.
  - 가져오기: `#btn-export`로 받은 파일(`page.waitForEvent('download')`)을 `#input-import`에 넣으면 맵이 추가로 늘어남. 깨진 파일을 넣으면 오류 문구가 보이고 카드 수 그대로.
  - 맵 50개(`Store`로 미리 저장)를 열어도 카드가 모두 보이고 페이지에 오류가 없음(`page.on('pageerror')`).
  - 카드를 열면 URL이 `editor.html?id=` 로 바뀜(편집 화면 내용은 Task 8a).
- [ ] **Step 2: 실패 확인** — `node --test tests/e2e/maplist.test.js` → FAIL.
- [ ] **Step 3: 구현** — `index.html`(스크립트 순서: `data/blocks.js`, `mapmodel`, `mapformat`, `viewmath`, `store`, `blocks`, `render`, `maplist`), `js/maplist.js`. 썸네일은 `toDataURL` 없이 각 카드의 캔버스에 직접 그린다(file://에서 막힘). 화면 밖 카드는 보일 때만 그린다(`IntersectionObserver`). 사용 안내 문구에 "브라우저 기록을 지우면 맵이 사라질 수 있으니 가끔 '전체 내보내기'로 받아 두세요"를 넣는다. 내보내기 파일명 `protocol-red-maps-YYYYMMDD.json`.
- [ ] **Step 4: 통과 확인** — `npm run test:e2e` → PASS. 스크린샷으로 목록 화면 한 장 확인.
- [ ] **Step 5: 커밋** — `git commit -m "맵 목록 페이지 추가"`

---

### Task 8a: 맵 편집 페이지 — 기본 (놓기·지우기·확대·저장)

**Files:**
- Create: `editor.html`, `js/editor.js`, `tests/e2e/editor.test.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 전 Task의 모듈
- Produces (화면 요소): 상단 `#btn-back`(맵 목록으로), `#map-title`, `#btn-undo`, `#btn-redo`, `#save-status`("저장됨"/"저장 중…"/"저장 실패 — 전체 내보내기로 백업하세요"), `#quota-banner`; 왼쪽 `[data-tool=brush|rect|erase|start|exit]`(이 Task에서는 brush·erase만 동작), `[data-layer=floor|objects]`, 종류 탭 `.palette-tab`, 블록 `.palette-block[data-block-id]`; 가운데 `#map-canvas`; 아래 `#zoom-label`("100%"), `#btn-zoom-in`, `#btn-zoom-out`, `#btn-fit`, `#btn-grid`. 테스트용 `window.__editor = {getView() -> View, getMap() -> MapData}`.
- 동작: `editor.html?id=<id>`로 열기(없는 id면 "맵을 찾을 수 없어요" + 목록 링크). 블록을 고르면 그 블록의 층이 선택된다. 바닥/물건 층 버튼은 목록에 보이는 블록과 지우개의 대상 층을 정한다. 클릭하면 놓고 누른 채 끌면 이어서 놓으며 한 번의 끌기는 되돌리기 한 번이다. 놓을 수 없는 자리(가장자리 걸침)는 빨간 미리보기이고 아무것도 놓이지 않는다. 휠은 마우스 위치 기준 확대·축소, 스페이스+끌기 또는 가운데 버튼 끌기로 이동, 열릴 때 전체 보기. 단축키 `Ctrl+Z`, `Ctrl+Y`/`Ctrl+Shift+Z`(맥은 `Cmd`). 변경 후 400ms 뒤 자동 저장. 저장 실패 시 `#quota-banner`를 보이고 작업은 메모리에 남긴다. 캔버스는 `requestAnimationFrame`으로 바뀐 때만 다시 그린다.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/e2e/editor.test.js`, 맵을 `localStorage`에 미리 만들어 두고 file://로 열기)
  - 열면 캔버스 크기가 0이 아니고 `#zoom-label`이 숫자%이며 맵 전체가 보이는 배율(`getView().scale`로 맵 가로 40칸이 캔버스 가로 안).
  - `tmp_floor_gray` 선택 → (3,3) 클릭 → `countPlacements`(`getMap()`을 읽어 계산)가 1; `Ctrl+Z`면 0; `Ctrl+Y`면 1. 같은 칸 위에 `tmp_floor_dirt`를 놓으면 총 개수는 그대로 1.
  - (2,2)에서 (6,2)로 끌면 5개가 놓이고 `Ctrl+Z` 한 번에 5개 모두 사라짐.
  - `tmp_house`(3×2)를 맵 오른쪽 가장자리 칸(39,0)에 클릭하면 놓이지 않음, (37,0)에 클릭하면 놓임(Review Focus 4). 그 위에 `tmp_crate`를 (38,1)에 놓으면 구조물이 통째로 사라짐.
  - 층 전환: `[data-layer=objects]`일 때 팔레트에 바닥 블록이 안 보임; 지우개로 물건 층의 블록을 지워도 같은 칸의 바닥은 남음.
  - 확대: `#btn-zoom-in`을 여러 번 눌러 `#zoom-label`이 "400%"에서 멈추고, `#btn-zoom-out` 반복으로 "4%"에서 멈춤. 휠로 확대해도 마우스 아래 칸이 변하지 않음. `#btn-fit` 후 전체가 다시 보임. 스페이스를 누른 채 끌면 `getView().x`가 바뀜.
  - 자동 저장: 놓은 뒤 `#save-status`가 결국 "저장됨"이 되고, 새로고침 후에도 블록이 그대로.
  - 저장 실패(Review Focus 1): 페이지에서 `Storage.prototype.setItem`을 예외를 던지게 바꾼 뒤 블록을 놓으면 `#quota-banner`가 보이고 `#save-status`가 "저장 실패"이며 `getMap()`에는 블록이 남아 있음.
  - 없는 id: `editor.html?id=없음`이면 안내 문구가 보임. 존재하지 않는 블록 id를 가진 맵(저장 데이터에 직접 넣음)을 열어도 페이지 오류(`pageerror`) 없이 열림(Review Focus 5).
- [ ] **Step 2: 실패 확인** — `node --test tests/e2e/editor.test.js` → FAIL.
- [ ] **Step 3: 구현** — `editor.html`(스크립트 순서는 Task 7과 같고 `history`, `editor` 추가), `js/editor.js`. 끌기 동안의 패치는 `combinePatches`로 합쳐 `history.commit` 한 번으로 기록한다. 마우스·터치는 pointer 이벤트로 통일한다.
- [ ] **Step 4: 통과 확인** — `npm run test:e2e` → PASS. 스크린샷으로 편집 화면 확인.
- [ ] **Step 5: 커밋** — `git commit -m "맵 편집 페이지 기본 기능 추가"`

---

### Task 8b: 맵 편집 페이지 — 사각형·표시·격자·크기 변경

**Files:**
- Modify: `editor.html`, `js/editor.js`, `css/style.css`
- Create: `tests/e2e/editor-tools.test.js`

**Interfaces:**
- Consumes: Task 8a의 화면 요소. 새 요소: `#btn-resize`(가로·세로 입력 창, `#resize-width`, `#resize-height`, `#resize-ok`). 이 Task에서 `[data-tool=rect|start|exit]`가 동작한다.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/e2e/editor-tools.test.js`)
  - `rect`: `tmp_floor_gray`로 (2,2)에서 (5,4)까지 끌면 12개; 끌기 중에 미리보기 영역이 보이고, `Ctrl+Z` 한 번에 12개 모두 취소. 3×2 블록은 2×2 스탬프 4개(Task 1 규칙 그대로).
  - `erase`: 끌면서 지우기가 한 번의 되돌리기. 시작 지점 위에서 지우개를 써도 표시는 그대로(표시는 `start`/`exit` 도구로만 바꾼다).
  - `start`/`exit`: 클릭으로 놓고, 다른 곳을 다시 클릭하면 시작은 이동·출구는 추가, 같은 칸 재클릭은 제거(되돌리기 가능). 둘 다 놓으면 맵 목록(`index.html`)에서 `.badge-incomplete`가 사라짐.
  - `#btn-grid`: 켜고 끌 수 있고 상태가 새로고침 뒤에도 유지(`localStorage` 사용, 실패해도 동작).
  - 크기 변경: 40×30 맵에 (39,29)와 (37,0) 3×2를 놓고 20×20으로 줄이려 하면 확인 창(`dialog`)에 잘리는 개수("2" 포함)가 보임 → 취소하면 크기·내용 그대로, 수락하면 20×20이 되고 두 블록이 없음(Review Focus 3). 줄이기·늘리기 모두 되돌릴 수 있게 하지는 **않는다**(크기 변경은 되돌리기 기록을 비운다고 화면에 안내). 1 미만·200 초과는 입력 오류로 막힘. 잘리는 게 없으면 확인 창 없이 바로 적용.
- [ ] **Step 2: 실패 확인** — `node --test tests/e2e/editor-tools.test.js` → FAIL.
- [ ] **Step 3: 구현** — `js/editor.js`에 사각형/표시/격자/크기 변경 추가. 크기 변경은 `countDroppedByResize` 결과가 0보다 클 때만 확인 창을 띄우고, 적용 후 `history.clear()`.
- [ ] **Step 4: 통과 확인** — `npm run test:e2e` → 전부 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "사각형·시작/출구·격자·크기 변경 추가"`

---

### Task 9: 큰 맵 속도 확인

**Files:**
- Create: `tests/e2e/perf.test.js`
- Modify: `js/render.js`, `js/editor.js` (속도 기준에 못 미칠 때만)

**Interfaces:**
- Consumes: `window.__editor`, `PR.Render.drawMap`

- [ ] **Step 1: 테스트 작성** — 200×200 맵에 바닥을 가득, 물건 8000개(`tmp_wall`/`tmp_crate`)를 `Store`로 만들어 편집기를 연 뒤: 전체 보기에서 `drawMap`을 10번 그린 평균이 **50ms 이하**; 100% 배율로 확대한 화면에서도 평균 50ms 이하이고 반환값 `drawn`이 전체 배치 수보다 작음(보이는 칸만 그림). 이 맵에서 블록을 칠하고 `Ctrl+Z` 한 번이 200ms 안에 끝남.
- [ ] **Step 2: 실행** — `node --test tests/e2e/perf.test.js`. 통과하면 Step 3 건너뜀.
- [ ] **Step 3: (실패 시만) 개선** — 화면에 보이는 맵 전체를 그림 한 장(보이지 않는 캔버스)에 미리 그려 두고, 확대·이동 때는 그 그림을 늘려 붙이며, 블록을 놓을 때는 바뀐 칸만 다시 그린다.
- [ ] **Step 4: 통과 확인** — `npm test && npm run test:e2e` → 전부 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "큰 맵 속도 검증 추가"`

---

### Task 10: 블록 그림 등록 도구

**Files:**
- Create: `tools/slice-sheet.js`, `tests/unit/slice-sheet.test.js`
- Modify: `package.json` (`pngjs` 개발용 의존성)

**Interfaces:**
- Produces (`require('./tools/slice-sheet')`):
  - `checkImage(png:{width,height,data}, cell = 64) -> string[]` — 한국어 경고 목록(빈 배열이면 문제 없음): 크기가 `cell`의 배수가 아님; 네 모서리가 모두 완전 불투명(배경이 투명하지 않을 수 있음 — 바닥 블록은 정상일 수 있으니 "확인" 문구); 아예 전부 투명.
  - `sliceSheet(png, cell = 64) -> {col, row, png:{width,height,data}, color:'#rrggbb', empty:boolean}[]` (왼쪽 위부터 가로 방향 순서, 투명한 칸은 `empty:true`, `color`는 불투명 픽셀의 평균색)
  - 명령줄: `node tools/slice-sheet.js <sheet.png> --cell 64 --prefix wall --names "벽,벽모서리" --layer objects --category 벽 --out assets/blocks` → 빈 칸을 건너뛰고 `assets/blocks/<prefix>_<번호>.png`로 저장, `data/blocks.js`에 붙여 넣을 블록 항목(id, name, layer, category, w:1, h:1, solid, color, file)을 출력. 경고가 있으면 먼저 출력한다. 한 장짜리 큰 구조물은 `--whole`로 자르지 않고 `w = 너비/cell`, `h = 높이/cell` 항목 하나로 출력.

- [ ] **Step 1: 실패하는 테스트 작성** — `pngjs`로 만든 128×64 이미지(왼쪽 칸 빨강 불투명·오른쪽 칸 완전 투명)에서 `sliceSheet`가 2개를 돌려주고 첫 번째 `color==='#ff0000'`·`empty:false`, 두 번째 `empty:true`; 100×64는 `checkImage`가 "64의 배수" 경고를 포함; 모서리가 모두 흰 불투명이면 배경 경고, 모서리가 투명이면 경고 없음; 192×128 `--whole` 항목은 `w:3,h:2`.
- [ ] **Step 2: 실패 확인** — `node --test tests/unit/slice-sheet.test.js` → FAIL.
- [ ] **Step 3: 구현** — `npm install --save-dev pngjs` 후 `tools/slice-sheet.js`.
- [ ] **Step 4: 통과 확인** — `npm test`. 이어서 임시 그림 한 장으로 명령줄을 실제로 실행해 출력 형식을 확인.
- [ ] **Step 5: 커밋** — `git commit -m "블록 그림 등록 도구 추가"`

---

### Task 11: 사용 안내와 마무리

**Files:**
- Create: `README.md`

- [ ] **Step 1: 안내 문서 작성(한국어, 쉬운 말)** — 열기(`index.html` 더블클릭), 맵 만들기와 블록 놓기, 확대/이동 방법, **백업 방법("전체 내보내기"를 자주 받고, 그 파일을 Claude에게 주면 `data/maps/`에 보관)**, 블록 그림 만드는 법(64×64 배수, 투명 배경 PNG, 챗지피티 요청문 예시), 시작·출구 표시의 의미. 맵 파일 형식(필드 목록)을 개발자용으로 아래에 짧게.
- [ ] **Step 2: 전체 검증** — `npm test && npm run test:e2e` → 전부 PASS. `index.html`을 file://로 열어 맵 만들기→배치→되돌리기→내보내기→새 브라우저에서 불러오기를 한 번 직접 따라 하고 스크린샷 두 장(목록, 편집기)을 남긴다.
- [ ] **Step 3: 커밋과 푸시** — `git add -A && git commit -m "사용 안내 추가" && git push -u origin claude/optimistic-cori-iutc8n`

---

## Self-Review 결과

- **스펙 범위 확인**: 5장 목록/편집(Task 7·8a·8b), 6장 칸·층(Task 1·8a), 7장 블록 등록(Task 6·10), 8장 시작·출구·미완성(Task 1·7·8b), 9장 저장·내보내기(Task 2·5·7), 10장 방식·큰 맵 속도(Task 6·9), 11장 검증(각 Task의 e2e), 13장 단계는 Task 순서로 반영. 스펙 12장(색·글꼴·단축키)은 구현자에게 맡김.
- **스펙과 달라진 곳**: `data/blocks.json` → `data/blocks.js`(file:// 제약), 불러오기는 기존 맵을 지우지 않고 추가만 함, 크기 변경은 되돌리기 기록을 비움. 모두 내 판단이며 사용자에게 알린다.
- **이름 일치 확인**: `placeBlock/eraseAt/fillRect/eraseRect/toggleStart/toggleExit/applyPatch/revertPatch/combinePatches/countDroppedByResize` 및 `serializeMap/parseMap`, `createStore`의 메서드 이름이 이후 Task의 사용처와 같다. 화면 요소 id는 Task 7·8a·8b에서 정의한 것을 이후 Task가 그대로 쓴다.
