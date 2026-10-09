#!/usr/bin/env node
// check-determinism.mjs — 静态检查：禁止渲染代码出现非确定性来源。
// 用法：node scripts/check-determinism.mjs <file-or-dir> [...]
// 退出码 0 = 通过；1 = 发现违规（可阻断 CI）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const FORBIDDEN = [
  { re: /\bDate\.now\s*\(/, name: 'Date.now()' },
  { re: /\bperformance\.now\s*\(/, name: 'performance.now()' },
  { re: /\bMath\.random\s*\(/, name: 'Math.random()' },
  { re: /\bnew\s+Date\s*\(/, name: 'new Date()' },
];
// 行内放行标记：出现 // determinism-ok 的行不检查
const ALLOW = /determinism-ok/;

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node check-determinism.mjs <file|dir> [...]');
  process.exit(2);
}

function walk(p) {
  const st = statSync(p);
  if (st.isFile()) return [p];
  return readdirSync(p).flatMap((n) => walk(join(p, n)));
}

let violations = 0;
let scanned = 0;

for (const t of targets) {
  for (const f of walk(t)) {
    if (!['.mjs', '.js', '.ts', '.jsx', '.tsx'].includes(extname(f))) continue;
    scanned++;
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (ALLOW.test(line)) return;
      // 去掉行尾注释后再匹配，避免注释里的示例被误报
      const code = line.replace(/\/\/.*$/, '');
      for (const { re, name } of FORBIDDEN) {
        if (re.test(code)) {
          violations++;
          console.log(`\u2717 ${f}:${i + 1}  禁用 ${name}  \u2192  ${line.trim()}`);
        }
      }
    });
  }
}

console.log(`\n扫描 ${scanned} 个文件，发现 ${violations} 处非确定性来源。`);
process.exit(violations > 0 ? 1 : 0);
