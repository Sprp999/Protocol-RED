#!/usr/bin/env node
// 블록 그림 등록 도구: 격자 그림을 칸 단위로 자르고, 그림에 문제가 없는지 검사한다.
// 사용법은 파일 맨 아래 printUsage()를 보세요.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

// expected 를 주면({w, h}: 차지하는 칸 수) 그림 크기가 아니라 가로세로 비율만 본다.
// 그림은 클수록 좋아요(원본 그대로 쓰면 줄여서 그릴 때 훨씬 깔끔해요). 한 칸 64픽셀보다 작을 때만 알려준다.
function checkImage(png, cell = 64, expected = null) {
  const warnings = [];
  const { width, height, data } = png;
  if (expected) {
    const perW = width / expected.w, perH = height / expected.h;
    if (Math.abs(perW - perH) > Math.max(perW, perH) * 0.01) {
      warnings.push(`그림 비율(${width}×${height})이 ${expected.w}×${expected.h}칸과 맞지 않아요.`);
    }
    if (perW < cell || perH < cell) {
      warnings.push(`그림이 너무 작아요(${width}×${height}). 한 칸에 ${cell}픽셀 이상이면 좋아요.`);
    }
  } else if (width % cell !== 0 || height % cell !== 0) {
    warnings.push(`그림 크기가 ${width}×${height}예요. 가로·세로가 ${cell}의 배수가 아니에요.`);
  }
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  const corners = [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)];
  if (corners.every((a) => a === 255)) {
    warnings.push('네 모서리가 모두 불투명해요. 배경이 투명하지 않을 수 있어요. (바닥 블록이면 정상이에요. 벽·물건이면 확인해 주세요.)');
  }
  let anyVisible = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) { anyVisible = true; break; }
  }
  if (!anyVisible) warnings.push('그림이 전부 투명해요.');
  return warnings;
}

// 애니메이션 시트(프레임이 격자로 모인 그림)를 검사한다. 경고 목록과 프레임 사이 차이(stats)를 돌려준다.
// expected: { cols, rows, size: {w, h} (프레임이 차지하는 칸 수) }
function checkAnimSheet(png, { cols, rows, size }, cell = 64) {
  const warnings = [];
  const { width, height, data } = png;
  if (width % cols !== 0 || height % rows !== 0) {
    warnings.push(`시트 크기(${width}×${height})가 ${cols}×${rows} 격자로 나누어떨어지지 않아요.`);
    return { warnings, stats: { consecutive: [], mean: 0 } };
  }
  const fw = width / cols, fh = height / rows;
  if (size) {
    if (Math.abs(fw / size.w - fh / size.h) > Math.max(fw / size.w, fh / size.h) * 0.01) {
      warnings.push(`프레임 한 장(${fw}×${fh})의 비율이 ${size.w}×${size.h}칸과 맞지 않아요.`);
    }
    if (fw / size.w < cell || fh / size.h < cell) {
      warnings.push(`프레임이 작아요(${fw}×${fh}). 한 칸에 ${cell}픽셀 이상이면 확대해도 선명해요.`);
    }
  }
  const frames = cols * rows;
  const pix = (k, x, y) => {
    const gx = (k % cols) * fw + x, gy = Math.floor(k / cols) * fh + y;
    return (gy * width + gx) * 4;
  };
  // 프레임 사이 평균 차이 (마지막 → 처음 포함)
  const consecutive = [];
  for (let k = 0; k < frames; k++) {
    const n = (k + 1) % frames;
    let sum = 0, cnt = 0;
    for (let y = 0; y < fh; y += 2) {
      for (let x = 0; x < fw; x += 2) {
        const a = pix(k, x, y), b = pix(n, x, y);
        sum += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) + Math.abs(data[a + 3] - data[b + 3]) / 2;
        cnt++;
      }
    }
    consecutive.push(sum / cnt / 3);
  }
  const mean = consecutive.reduce((s, v) => s + v, 0) / consecutive.length;
  const dup = consecutive.map((v, i) => (v < 0.05 ? i : -1)).filter((i) => i >= 0 && i < frames - 1);
  if (dup.length) warnings.push(`프레임 ${dup.map((i) => i + 1).join(', ')}번이 다음 프레임과 같은 그림이에요. (움직임이 멈칫해요)`);
  const wrap = consecutive[frames - 1];
  const others = consecutive.slice(0, frames - 1);
  const othersMax = Math.max(...others);
  if (othersMax > 0 && wrap > othersMax * 1.5) {
    warnings.push('마지막 프레임에서 처음으로 돌아올 때 그림이 크게 튀어요. (반복이 매끄럽지 않아요)');
  }
  // 격자: 프레임과 프레임 사이 경계의 양쪽 한 줄이 모두 투명하면 격자가 분명하다
  let gapless = false;
  const clearLine = (pts) => pts.filter(([x, y]) => data[(y * width + x) * 4 + 3] <= 16).length / pts.length >= 0.9;
  for (let c = 1; c < cols && !gapless; c++) {
    const bx = c * fw;
    const ys = Array.from({ length: height }, (_, y) => y);
    if (!(clearLine(ys.map((y) => [bx - 1, y])) && clearLine(ys.map((y) => [bx, y])))) gapless = true;
  }
  for (let r = 1; r < rows && !gapless; r++) {
    const by = r * fh;
    const xs = Array.from({ length: width }, (_, x) => x);
    if (!(clearLine(xs.map((x) => [x, by - 1])) && clearLine(xs.map((x) => [x, by])))) gapless = true;
  }
  if (gapless) warnings.push('프레임 사이에 투명한 간격이 없어요. 프레임 경계가 분명한지(그림이 옆 칸에 번지지 않는지) 확인해 주세요.');
  return { warnings, stats: { consecutive, mean } };
}

// 층 규칙: 바닥·바닥꾸미기만 걸어다닐 수 있고, 벽·벽꾸미기·물건은 전부 막힌다
function defaultSolid(layer) {
  return layer !== 'floor' && layer !== 'floordeco';
}

function averageColor(png) {
  let r = 0, g = 0, b = 0, n = 0;
  const { data } = png;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (!n) return { color: '#000000', empty: true };
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return { color: '#' + hex(r) + hex(g) + hex(b), empty: false };
}

function sliceSheet(png, cell = 64) {
  const cols = Math.floor(png.width / cell);
  const rows = Math.floor(png.height / cell);
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = new PNG({ width: cell, height: cell });
      PNG.bitblt(png, tile, col * cell, row * cell, cell, cell, 0, 0);
      const { color, empty } = averageColor(tile);
      tiles.push({ col, row, png: tile, color, empty });
    }
  }
  return tiles;
}

function wholeEntry(png, cell, info) {
  return {
    id: info.id,
    name: info.name,
    layer: info.layer,
    category: info.category,
    w: info.size ? info.size.w : Math.round(png.width / cell),
    h: info.size ? info.size.h : Math.round(png.height / cell),
    solid: info.solid,
    color: averageColor(png).color,
    file: info.file,
    ...(info.anim ? { anim: { frames: info.anim.cols * info.anim.rows, cols: info.anim.cols, rows: info.anim.rows, fps: info.anim.fps } } : {}),
  };
}

function formatEntry(e) {
  const q = (s) => JSON.stringify(s);
  const anim = e.anim ? `, anim: { frames: ${e.anim.frames}, cols: ${e.anim.cols}, rows: ${e.anim.rows}, fps: ${e.anim.fps} }` : '';
  return `    { id: ${q(e.id)}, name: ${q(e.name)}, layer: ${q(e.layer)}, category: ${q(e.category)}, ` +
    `w: ${e.w}, h: ${e.h}, solid: ${e.solid}, color: ${q(e.color)}, file: ${q(e.file)}${anim} },`;
}

function printUsage() {
  console.log([
    '사용법: node tools/slice-sheet.js <그림.png> [옵션]',
    '  --cell 64            한 칸 크기(기본 64)',
    '  --prefix wall        블록 id 앞부분 (wall_1, wall_2 …)',
    '  --names "벽,벽 모서리"  블록 이름(순서대로, 빈 칸은 건너뜀)',
    '  --layer objects      floor(바닥) 또는 objects(물건)',
    '  --category 벽         팔레트 탭 이름',
    '  --solid true|false   막힘 여부 (기본: 바닥·바닥꾸미기는 false, 벽·벽꾸미기·물건은 true)',
    '  --whole              큰 구조물 한 장을 자르지 않고 원본 크기 그대로 등록',
    '  --size 1x2           (--whole과 함께) 차지하는 칸 수 가로x세로. 안 주면 그림 크기÷64',
    '  --anim 4x4           (--whole과 함께) 프레임이 가로x세로 격자로 모인 애니메이션 시트. 프레임 한 장이 --size 칸',
    '  --fps 16             (--anim과 함께) 초당 프레임 수(기본 12)',
    '  --out assets/blocks  저장 폴더',
  ].join('\n'));
}

function parseArgs(argv) {
  const opts = { cell: 64, layer: 'objects', out: 'assets/blocks', whole: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--whole') opts.whole = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  opts.cell = Number(opts.cell);
  opts.file = rest[0];
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.file || !opts.prefix) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const png = PNG.sync.read(fs.readFileSync(opts.file));
  const sizeMatch = opts.size && /^(\d+)x(\d+)$/.exec(opts.size);
  const size = sizeMatch ? { w: Number(sizeMatch[1]), h: Number(sizeMatch[2]) } : null;
  const animMatch = opts.anim && /^(\d+)x(\d+)$/.exec(opts.anim);
  const anim = animMatch ? { cols: Number(animMatch[1]), rows: Number(animMatch[2]), fps: Number(opts.fps) || 12 } : null;
  let warnings;
  if (anim) {
    const res = checkAnimSheet(png, { cols: anim.cols, rows: anim.rows, size: size || { w: 1, h: 1 } }, opts.cell);
    warnings = res.warnings;
    console.log(`프레임 사이 평균 차이(마지막→처음 포함): ${res.stats.consecutive.map((v) => v.toFixed(1)).join(' ')}`);
  } else {
    warnings = checkImage(png, opts.cell, opts.whole ? size : null);
  }
  for (const w of warnings) console.log('⚠ ' + w);
  const solid = opts.solid === undefined ? defaultSolid(opts.layer) : opts.solid === 'true';
  const category = opts.category || (opts.layer === 'floor' ? '바닥' : '물건');
  const names = (opts.names || '').split(',').map((s) => s.trim());
  fs.mkdirSync(opts.out, { recursive: true });
  const entries = [];
  const toFile = (id) => path.posix.join(opts.out.split(path.sep).join('/'), id + '.png');
  if (opts.whole) {
    const id = opts.prefix;
    fs.writeFileSync(path.join(opts.out, id + '.png'), PNG.sync.write(png));
    entries.push(wholeEntry(png, opts.cell, { id, name: names[0] || id, layer: opts.layer, category, solid, file: toFile(id), size, anim }));
  } else {
    let n = 0;
    for (const t of sliceSheet(png, opts.cell)) {
      if (t.empty) continue;
      n++;
      const id = `${opts.prefix}_${n}`;
      fs.writeFileSync(path.join(opts.out, id + '.png'), PNG.sync.write(t.png));
      entries.push({ id, name: names[n - 1] || `${opts.prefix} ${n}`, layer: opts.layer, category, w: 1, h: 1, solid, color: t.color, file: toFile(id) });
    }
  }
  console.log(`\n블록 ${entries.length}개를 ${opts.out} 에 저장했어요. data/blocks.js 에 아래 줄을 붙여 넣으세요:\n`);
  for (const e of entries) console.log(formatEntry(e));
}

module.exports = { defaultSolid, checkImage, checkAnimSheet, sliceSheet, wholeEntry, averageColor, formatEntry };
if (require.main === module) main(process.argv.slice(2));
