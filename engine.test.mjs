/* engine.test.mjs —— wave-forge 无头不变量测试
 * 从 index.html 正则抽出 <script id="engine"> 块，塞进 Node vm 沙箱执行，
 * 证明「页面里跑的引擎 = 独立可复用的 JS 模块」，然后跑 10 条不变量。
 * 运行：node engine.test.mjs   （期望 10/10 ALL GREEN）
 * Author: 晨星 / Chenxing
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error('FATAL: <script id="engine"> not found in index.html'); process.exit(1); }
if (/document|window|fetch/.test(m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''))) {
  console.error('FATAL: engine block references DOM/network — purity violated'); process.exit(1);
}
const ctx = { console, Math, Float64Array, Number, isFinite };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: 'wave-engine.js' });
const E = ctx.ENGINE ?? vm.runInContext('ENGINE', ctx);

function fmt(x) {
  if (typeof x !== 'number' || !isFinite(x)) return String(x);
  return x.toExponential(6);
}

const results = [];
function report(id, name, pass, rows) {
  results.push({ id, name, pass, rows });
  console.log((pass ? 'PASS' : 'FAIL') + '  [' + id + '] ' + name);
  for (const [k, v] of rows) console.log('      · ' + k + ' = ' + v);
}

/* [T1] 范数守恒（含壁反弹长演化） */
{
  const g = E.makeGrid(601, 4, null);
  const psi = E.gaussianPacket(g, 2, 0.3, Math.PI);
  const buf = {};
  const n0 = E.norm(g, psi);
  for (let i = 0; i < 4000; i++) E.cnStep(g, psi, 0.001, buf);
  const drift = Math.abs(E.norm(g, psi) - n0);
  report('T1', '范数守恒 / Crank–Nicolson 酉性，含壁反弹 4000 步', drift < 1e-10, [
    ['n0', n0.toFixed(15)], ['drift', fmt(drift)], ['阈值', '< 1e-10'],
  ]);
}

/* [T2] 本征态正交归一 */
{
  const g = E.makeGrid(401, 2, null);
  let worst = 0, worstN = 0;
  for (let n = 1; n <= 5; n++) {
    const s = E.eigenstate(g, n);
    worstN = Math.max(worstN, Math.abs(E.norm(g, s) - 1));
    for (let k = n + 1; k <= 5; k++) {
      const ip = E.inner(g, s, E.eigenstate(g, k));
      worst = Math.max(worst, Math.abs(ip.re), Math.abs(ip.im));
    }
  }
  report('T2', '本征态正交归一 / 前 5 态两两对照', worst < 1e-10 && worstN < 1e-12, [
    ['max|⟨n|m⟩| (n≠m)', fmt(worst)], ['max|‖ψₙ‖²−1|', fmt(worstN)],
  ]);
}

/* [T3] 基态/第 2 本征能量 vs 解析解（逆迭代 + Rayleigh 商） */
{
  const g = E.makeGrid(512, 1, null);
  const r1 = E.inverseIteration(g, 1);
  const r2 = E.inverseIteration(g, 2);
  const E1a = Math.PI * Math.PI / 2, E2a = 2 * Math.PI * Math.PI;
  const e1 = Math.abs(r1.E - E1a) / E1a, e2 = Math.abs(r2.E - E2a) / E2a;
  const ip = E.inner(g, r1.psi, r2.psi);
  report('T3', '数值本征值 vs 解析解 / E₁=π²/2, E₂=2π²（N=512, 离散误差 O(dx²)）',
    e1 < 1e-4 && e2 < 1e-4 && Math.abs(ip.re) < 1e-5, [
    ['E₁ 数值', r1.E.toFixed(8)], ['E₁ 解析', E1a.toFixed(8)], ['E₁ 相对误差', fmt(e1)],
    ['E₂ 数值', r2.E.toFixed(8)], ['E₂ 解析', E2a.toFixed(8)], ['E₂ 相对误差', fmt(e2)],
    ['|⟨ψ₁|ψ₂⟩|', fmt(Math.abs(ip.re))],
  ]);
}

/* [T4] 自由波包中心漂移 ⟨x⟩(t) = x₀ + ħk₀t（Ehrenfest） */
{
  const g = E.makeGrid(801, 4, null);
  const x0 = 1.2, k0 = Math.PI, s0 = 0.25, T = 0.2, dt = 0.0002;
  const psi = E.gaussianPacket(g, x0, s0, k0);
  const buf = {};
  for (let i = 0; i < Math.round(T / dt); i++) E.cnStep(g, psi, dt, buf);
  const xm = E.xMean(g, psi), ana = x0 + k0 * T;
  const err = Math.abs(xm - ana) / Math.abs(ana);
  report('T4', '波包中心漂移 / ⟨x⟩(t) ≡ x₀ + ħk₀t·m⁻¹', err < 1e-3, [
    ['数值 ⟨x⟩', xm.toFixed(8)], ['解析 x₀+ħk₀t', ana.toFixed(8)], ['相对误差', fmt(err)], ['阈值', '< 1e-3'],
  ]);
}

/* [T5] 自由波包展宽 σ(t) = σ₀√(1+(ħt/2mσ₀²)²) */
{
  const g = E.makeGrid(801, 4, null);
  const x0 = 2, s0 = 0.3, T = 0.3, dt = 0.0002;
  const psi = E.gaussianPacket(g, x0, s0, 0);
  const buf = {};
  for (let i = 0; i < Math.round(T / dt); i++) E.cnStep(g, psi, dt, buf);
  const xm = E.xMean(g, psi), x2 = E.x2Mean(g, psi);
  const sd = Math.sqrt(Math.max(0, x2 - xm * xm));
  const q = T / (2 * s0 * s0);
  const ana = s0 * Math.sqrt(1 + q * q);
  const err = Math.abs(sd - ana) / ana;
  report('T5', '波包展宽 / σ(t) ≡ σ₀√(1+(ħt·2m⁻¹σ₀⁻²)²)，展宽 ' + ((ana / s0 - 1) * 100).toFixed(1) + '%',
    err < 5e-3, [
    ['数值 σ(t)', sd.toFixed(8)], ['解析 σ(t)', ana.toFixed(8)], ['相对误差', fmt(err)], ['阈值', '< 5e-3'],
  ]);
}

/* [T6] 本征态能量守恒 */
{
  const g = E.makeGrid(401, 2, null);
  const psi = E.eigenstate(g, 1);
  const E0 = E.energy(g, psi);
  const buf = {}; let worst = 0;
  for (let i = 0; i < 2000; i++) {
    E.cnStep(g, psi, 0.001, buf);
    worst = Math.max(worst, Math.abs(E.energy(g, psi) - E0) / E0);
  }
  report('T6', '本征态能量守恒 / 相位精确演化 2000 步', worst < 1e-10, [
    ['E₀', E0.toFixed(10)], ['max 相对漂移', fmt(worst)], ['阈值', '< 1e-10'],
  ]);
}

/* [T7] 酉性：正交对演化后仍正交 */
{
  const g = E.makeGrid(401, 2, null);
  const a = E.eigenstate(g, 1), b = E.eigenstate(g, 2);
  const bufA = {}, bufB = {}; let worst = 0;
  for (let i = 0; i < 1500; i++) {
    E.cnStep(g, a, 0.001, bufA);
    E.cnStep(g, b, 0.001, bufB);
    const ip = E.inner(g, a, b);
    worst = Math.max(worst, Math.abs(ip.re), Math.abs(ip.im));
  }
  report('T7', '酉性 / |⟨ψ₁(t)|ψ₂(t)⟩| 恒 0（1500 步）', worst < 1e-12, [
    ['max |⟨ψ₁|ψ₂⟩|', fmt(worst)], ['阈值', '< 1e-12'],
  ]);
}

/* [T8] ⟨E⟩ 双口径交叉验证：微分式 ≡ 共轭式 */
{
  const g = E.makeGrid(401, 2, (x, L) => (Math.abs(x - L / 2) < L * 0.05 ? 200 : 0));
  const psi = E.gaussianPacket(g, 0.5, 0.12, Math.PI * 3);
  const e1 = E.energy(g, psi), e2 = E.energyConj(g, psi);
  const err = Math.abs(e1 - e2) / Math.abs(e2);
  report('T8', '能量双口径 / 微分式 ≡ ⟨ψ|Hψ⟩ 共轭式（方势垒场，O(dx²) 量级守卫）', err < 5e-3, [
    ['微分式', e1.toFixed(10)], ['共轭式', e2.toFixed(10)], ['相对误差', fmt(err)],
    ['阈值', '< 5e-3（两口径在离散网格仅 O(dx²) 一致，本用例守卫量级错误：符号/因子/质量参数错误会产生 O(1) 偏差）'],
  ]);
}

/* [T9] 数值健康：强散射长演化无 NaN / Infinity */
{
  const g = E.makeGrid(601, 4, (x, L) => (Math.abs(x - L / 2) < L * 0.03 ? 300 : 0));
  const psi = E.gaussianPacket(g, 1, 0.25, Math.PI * 4);
  const buf = {}; let bad = 0, scanned = 0;
  for (let i = 0; i < 6000; i++) {
    E.cnStep(g, psi, 0.001, buf);
    if (i % 10 === 0) for (let j = 0; j < g.N; j++) {
      scanned++;
      if (!Number.isFinite(psi.re[j]) || !Number.isFinite(psi.im[j])) bad++;
    }
  }
  report('T9', '数值健康 / 6000 步方势垒强散射，全网格扫描', bad === 0, [
    ['扫描值数', String(scanned)], ['非有限值', String(bad)],
  ]);
}

/* [T10] 确定性：同 seed 初态与演化逐位相同 */
{
  const g = E.makeGrid(401, 2, null);
  const a = E.randomSuperposition(g, 4, 20260929);
  const b = E.randomSuperposition(g, 4, 20260929);
  let same = true;
  for (let j = 0; j < g.N; j++) if (a.re[j] !== b.re[j] || a.im[j] !== b.im[j]) same = false;
  const bufA = {}, bufB = {};
  for (let i = 0; i < 500; i++) { E.cnStep(g, a, 0.001, bufA); E.cnStep(g, b, 0.001, bufB); }
  let same2 = true;
  for (let j = 0; j < g.N; j++) if (a.re[j] !== b.re[j] || a.im[j] !== b.im[j]) same2 = false;
  report('T10', '确定性 / seed=20260929 初态 + 500 步演化全等', same && same2, [
    ['初态全等', same ? 'YES' : 'NO'], ['演化后全等', same2 ? 'YES' : 'NO'],
  ]);
}

const pass = results.filter(r => r.pass).length;
console.log('─'.repeat(70));
console.log('  TOTAL = ' + results.length + '   PASS = ' + pass + '   FAIL = ' + (results.length - pass));
console.log(pass === results.length ? '  RESULT: ALL GREEN ✅' : '  RESULT: FAILED ❌');
process.exit(pass === results.length ? 0 : 1);
