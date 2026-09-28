# Wave Forge · 一维薛定谔方程锻造炉

> A single-file, zero-dependency time-dependent Schrödinger equation workbench: hand-written
> Crank–Nicolson solver (complex tridiagonal Thomas solve), cross-checked against analytic
> solutions, with a built-in one-click invariant self-check panel and a headless Node test
> suite (10/10 green).
>
> 单文件、零外部依赖的含时薛定谔方程实验台：纯 JS 手写 Crank–Nicolson 隐式求解
> （复三角 Thomas 解算，O(N)/步），与解析解逐项对照，内置一键不变量自检面板，
> 并配 Node 无头测试（10/10 全绿）。ħ = m = 1 自然单位。

**作者 / Author:** 晨星 / Chenxing　·　**License:** MIT

---

## 这是什么 / What it is

`index.html` 是一个双击即开的量子波包实验台：

* **算法全部手写**，不依赖任何库：可播种 PRNG（mulberry32）、复三对角 Thomas 解算、
  逆迭代 + Rayleigh 商求静态本征对、含 deflation 的逐阶正交化，全部在一个文件里。
* **引擎可整体抽出**：核心算法写在 `<script id="engine">` 块里，不含任何 `document` /
  `window` / `fetch` 引用；`engine.test.mjs` 把它从 HTML 正则抽出、塞进 Node `vm` 沙箱
  执行并跑全部用例 —— 这是"引擎能当独立 JS 模块用"的机械证明。
* **Crank–Nicolson 酉格式**：(I + i·dt/2·H) ψⁿ⁺¹ = (I − i·dt/2·H) ψⁿ，无条件稳定、
  范数严格守恒（实测漂移 1e-11 / 4000 步含壁反弹）。
* **不变量是真的在算**：每一条都在页面上打印实测数值，不是文档里的漂亮话。

Everything (CSS, JS, Canvas rendering, tests) is inline in one file. No CDN, no web font,
no network request of any kind.

---

## 快速开始 / Quick start

```bash
# 方式一：直接打开
#   双击 index.html，选势场 / 初态，点「播放」，点「一键自检」跑全部 10 条不变量

# 方式二：Node 无头验证（无需安装任何依赖）
node engine.test.mjs        # 期望输出：10/10 ALL GREEN ✅
```

可玩的部分：四种势场（无限深势阱 / 方势垒 / 谐振子 / 自由宽盒）、三种初态
（右行高斯波包 / 第 1 本征态 / 随机本征态叠加）、dt 与每帧步数可调、
Re ψ / Im ψ / |ψ|² 与势场实时同绘、⟨E⟩ ⟨x⟩ σ(t) 实时读数。

---

## 不变量清单 / Invariants（全部实测）

| # | 不变量 | 判据 | 实测 |
|---|--------|------|------|
| 01 | 范数守恒（CN 酉性） | 漂移 < 1e-10 | **1.06e-11**（4000 步含壁反弹） |
| 02 | 本征态正交归一 | \|⟨n\|m⟩\|<1e-10 | **2.36e-16** / 归一 6.66e-16 |
| 03 | 数值本征值 vs 解析解 | 相对误差 < 1e-4 | E₁ **3.15e-6**、E₂ **1.26e-5**（N=512，O(dx²) 离散误差）；\|⟨ψ₁\|ψ₂⟩\| = **3.0e-16** |
| 04 | 波包中心漂移 ⟨x⟩=x₀+ħk₀t | < 1e-3 | **2.05e-6**（Ehrenfest 定理数值验证） |
| 05 | 波包展宽 σ(t)=σ₀√(1+(ħt/2mσ₀²)²) | < 5e-3 | **1.60e-3**（展宽 94.4%） |
| 06 | 本征态能量守恒 | < 1e-10 | **2.49e-12**（相位精确演化 2000 步） |
| 07 | 酉性：正交对演化后仍正交 | < 1e-12 | **6.97e-14** |
| 08 | ⟨E⟩ 双口径交叉验证 | O(dx²) 量级守卫 | **1.16e-3**（守卫符号/因子/质量参数的量级错误） |
| 09 | 数值健康 | 无 NaN / Infinity | 360600 个扫描值，**0 非有限**（6000 步方势垒强散射） |
| 10 | 确定性 | 同 seed 逐位相同 | 初态 + 500 步演化 **全等** |

> 关于 [08] 的判据：微分式 ½∫\|ψ'\|²+V\|ψ\|² 与共轭式 ⟨ψ\|Hψ⟩ 在连续极限下相等，
> 但在离散网格上只有 O(dx²) 一致，故阈值为量级守卫（5e-3）而非逐位一致——
> 符号、系数 ½、质量参数等实现错误会产生 O(1) 偏差，被本用例拦截。
> 判据写在测试源码注释里，可复核。

---

## 调试实录 / Debug notes（三个真 bug，自检的价值）

初版实现曾同时挂掉 6 条用例，根因全部靠不变量定位：

1. **CN 对角元实部误写** `1 + hdt·H`（应为 `1`，hdt·H 属虚部）→ 每步整体衰减、
   范数每步 ×0.55，T1/T4/T5/T6/T7 全挂。由 T1 范数守恒定位。
2. **静态本征对边界行未解耦**：只把边界对角元改成 1，但 `off` 仍耦合边界与内点，
   矩阵不再是离散哈密顿量。改为仅在 M=N−2 个内点上建矩阵。
3. **deflation 投影内积漏乘 dx**（投影系数大了 1/dx≈512 倍，每次投影都把向量
   过度减回基态）且**投影必须在求解之后**（H⁻¹ 会把基态分量放大 (E₂/E₁) 倍）。
   由 T3 的 \|⟨ψ₁\|ψ₂⟩\|=1.0 精确复现定位。

---

## 目录结构 / Layout

```
wave-forge/
├── index.html        # 单文件实验台：界面 + 内联引擎 + 一键自检面板
├── engine.test.mjs   # Node 无头测试：正则抽出 <script id="engine"> 进 vm 沙箱跑 10 条用例
├── README.md
└── LICENSE           # MIT，Copyright (c) 2026 晨星
```

复用引擎：直接复制 `<script id="engine">` 整块，或参照 `engine.test.mjs` 的抽取逻辑
改造成任意运行时的加载器。引擎不碰 DOM，可在 Node / Worker / 任何 JS 运行时里跑。

---

## License

MIT © 2026 晨星 / Chenxing
