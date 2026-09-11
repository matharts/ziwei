# Wasm Adapter 设计

状态：2026-09-11 按用户“并发执行”要求实施（D-267）。Rust 适配位于 `bindings/wasm`，浏览器包位于 `packages/ziwei-wasm`；实际验证进度见[交付计划](cross-platform-delivery-plan.md)。本文不表示所有浏览器或原生候选已通过验收，不修改既有 Node 合同。

## 结论与职责

采用独立 `wasm-bindgen` Adapter，目标为 `wasm32-unknown-unknown`，默认单线程；复用唯一的 `ziwei` 核心，不将现有 Node 包改成隐式 Wasm fallback。

这一选择延续 [Rust 包架构](rust-package-design.md#只在真实-seam-处拆包) 与 D-260：Rust 引擎、各宿主 Adapter 单向依赖；Wasm 不成为核心 feature。另一条真实路线——复用 napi-rs 的 WASI 产物——保留作对照，不将其成熟度等同于本项目已通过验证。

本文件负责 Rust Wasm 持有、输入和结果传输、初始化后的同步能力及生命周期。[浏览器设计](browser-adapter-design.md)负责资源定位、CSP、SSR、构建工具、Worker 消费与真实浏览器矩阵；两份文件描述同一个 Adapter，不重复实现。

## 已核对的源码事实

| 位置 | 当前事实 | 对 Wasm 的影响 |
| --- | --- | --- |
| [核心 manifest](../../crates/ziwei/Cargo.toml) | 唯一直接依赖为关闭默认特性的 `arrayvec 0.7.8`；继承 Rust 1.98、edition 2024、`unsafe_code = forbid` | 不需要为 Wasm 拆分排盘规则或新增公共序列化层 |
| [核心源码](../../crates/ziwei/src/lib.rs) | 不是 `no_std`；源码中显式 `std::` 仅用于错误实现，未发现线程、文件、网络、时钟、环境变量或随机数调用 | 与无操作系统的纯计算目标匹配，但源码审计不能替代目标编译与运行 |
| [Node manifest](../../bindings/node/Cargo.toml) | napi `3.12.2`、napi-derive `3.6.3`、napi-build `2.4.1`；关闭 napi 默认特性，仅选 `napi8` | 当前没有异步任务或线程池能力必须迁移到浏览器 |
| [Node Natal](../../bindings/node/src/natal.rs) | 持有核心 `Natal`，经 `Env` 记账及 finalize 回收；输入为 `Unknown`，结果为 napi DTO | 核心查询可复用，Node-API 对象、记账与异常传递不能直接用于 wasm-bindgen |
| [TS 类型与常量](../../packages/ziwei/src/types.ts) | 顶层调用 `native.identities()`，身份派生方法也调用 native | 不能把现有文件原样作为浏览器安全的静态类型入口 |
| [TS Natal](../../packages/ziwei/src/natal.ts) | 包装私有 native holder，深层冻结，独立保存 `profile`、`palaces` | 可复用合同与投影思想，不直接导入 `binding.cjs` 或承诺代码零修改 |

核心的 `std::error::Error` 不要求引入 WASI。Rust 对 `wasm32-unknown-unknown` 提供部分标准库，但文件、线程等能力存在限制；不能将“支持 std”理解为支持所有宿主操作。[Rust 目标说明](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html)

## 两条路线对照

| 维度 | 复用 napi-rs / `wasm32-wasip1-threads` | 独立 wasm-bindgen / `wasm32-unknown-unknown` |
| --- | --- | --- |
| 真实实现路径 | 现有 Rust napi 导出编译为 Wasm，emnapi 实现 Node-API，WASI runtime 提供宿主设施 | 新 Rust Adapter 直接调用核心，wasm-bindgen 生成 JS/Wasm glue |
| 可复用内容 | 较多 napi 校验、DTO 与导出代码；仍需验收 finalizer、外部内存记账等行为 | 核心全部复用；JS 表示、错误载荷、冻结及缓存合同可沿用；转换实现重写 |
| 浏览器要求 | 此 threads 目标使用 shared memory；官方浏览器方案要求跨源隔离及 Worker 配置 | 首版不启用线程、共享内存或 Rayon；不因本引擎要求跨源隔离 |
| 产物依赖 | Wasm、浏览器 glue、Worker，以及 `@napi-rs/wasm-runtime`、兼容的 emnapi 包 | Wasm、生成 glue/声明、TS 门面；不引入 Node-API/WASI 模拟层 |
| 初始化 | 当前 browser glue 含顶层 await；`asyncInit: false` 也不消除资源获取的 await | `--target web` 提供显式初始化；TS 门面可以导入无副作用、初始化后同步调用 |
| 内存与冷启动 | CLI 浏览器模板默认初始 4000 页，即 250 MiB；可调整，不能照搬为项目预算 | 不假定固定体积或更快；从实际二进制、初始内存及端到端测量确定预算 |
| 既有架构 | 直接复用 `bindings/node` 实现浏览器，需明确修订独立 Adapter、宿主职责约束 | 保持 `bindings/wasm` 与 `bindings/node` 彼此不依赖 |
| 主要代价 | 少写转换，但增加运行时、线程部署、生命周期和资源装载的验证面 | 新增转换代码及跨 Adapter 一致性测试，需独立管理 Wasm 生命周期 |

官方 napi 指南给出的命令为 `napi build --platform --release --target wasm32-wasip1-threads`；纯 Rust 依赖使用 Rust 的 WASI linker，C/C++ 依赖才需要额外 WASI C 工具链。这里没有执行该命令或安装 target。[napi WebAssembly 文档](https://napi.rs/docs/concepts/webassembly)

上述对照于 2026-09-11 使用当时的 CLI `3.9.0`，不是当前依赖清单。已对照该版本[浏览器模板源码](https://github.com/napi-rs/napi-rs/blob/f4cbe8d6486488b556f7d2886bb6cd0309705721/cli/src/api/templates/load-wasi-template.ts)：上述 threads/shared-memory、fetch await 与默认内存来自该版本的真实生成路径，不从 Node-API ABI 推断。当前 Catalog 已随上游升级至 `3.9.1`；本次仅保留历史选型依据，不声称完成新版浏览器模板的重新验收，也不改变独立 wasm-bindgen 路线。此比较只针对所列 threads 路线，不声称 napi-rs 只有一种 Wasm 配置。

推荐独立路线的理由是当前计算不使用 Node/WASI 设施，而浏览器部署不应为兼容层承担未使用的共享内存与线程要求。这是架构取舍，不是体积或性能胜出结论。

## 目录与复用边界

```text
crates/ziwei/                 唯一领域实现，不添加 Wasm 依赖或 feature
bindings/node/                保留已确认的 Node Adapter
bindings/wasm/                Rust Adapter；Cargo 包 ziwei-wasm
  src/lib.rs                 构造与身份导出
  src/natal.rs               持有、查询、结果投影与释放
  src/input.rs               JsValue 表示检查及核心值构造
  src/error.rs               核心错误到私有传输记录的映射
  src/wire.rs                独立 DTO 投影与私有生成声明
packages/ziwei/               保留 @matharts/ziwei 的 Node 入口
packages/ziwei-wasm/          浏览器 ESM 门面，npm 名 @matharts/ziwei-wasm
  src/                       初始化、只读包装、输入捕获与错误外观
  generated/                 wasm-bindgen glue/Wasm/声明，不手写、不提交
  test/                      Wasm seam、公开合同、生命周期与消费端测试
```

这些目录均承载实现，继续使用根 Cargo/pnpm workspace、锁文件和 mise；手写代码为 Rust/TypeScript，生成 JavaScript 是分发产物。

第一切片不先抽公共 Rust crate。只有两种 Adapter 的实际转换稳定且确有重复维护成本时，才评估无宿主依赖的共享代码；不得把 napi/JsValue 类型放入核心。

TS 的真实 seam 是“得到已验证结果的查询能力”与“只读宿主外观”之间。先用跨 Adapter 合同测试复用规格；需要共享实现时再提取不导入 `.node`、不隐式初始化的内部模块，不让 Wasm 包在运行时依赖整个 Node 包。新包的 `exports` 与路径确认前不搬迁现有文件。

## JS 传输合同

行为以 [Node 合同](node-api-design.md#3-输入与表示)作为对齐基线，并通过真实 Wasm 的跨 Adapter 差分验证。

1. 两个建盘入口、28 个核心读取/查询、`palaceStar`、`toJSON` 与身份辅助完整覆盖；规则只调用核心。单项查询只转换请求范围，限运不提前计算。
2. `Birth`、`Parameters` 的字段、零/负年份、枚举映射与自身数据属性捕获保持一致；拒绝 accessor、额外键和 symbol 键，不触发值强制转换，Proxy trap 异常原样传播。
3. Wasm 私有入口接收 `JsValue`，先核验类型、有限数、整数与范围，再转 Rust 整数；不能直接以 `u8/i32` 参数让 glue 先截断。即使绕过 TS 门面也不得接受非法整数。[wasm-bindgen 数值转换](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/numbers.html)
4. 输出用 `js_sys` 构造普通对象/数组或私有元组，不经 JSON 文本往返；内部 DTO 不成为新领域模型。第一版不为此给核心添加 serde 派生。
5. `None` 显式变成 `null`，不依赖生成 glue 的可选数值默认行为；不产生稀疏数组。名称读取核心，不复制名称或排盘规则表。
6. `DecadeYear.year` 当前可到 `2147483771`，仍是精确 JS number。核心 i64 结果检查安全整数后转 f64/JsValue；不能直接导出 i64 并使公开结果变成 BigInt，也不能收窄回 i32。
7. 五类核心错误与 `INVALID_ARGUMENT` 沿用中文 `ZiweiError`、稳定 code/detail 载荷；NaN/Infinity 错误值不被 JSON 序列化损坏。预期错误作为私有记录传回，由 TS 构造公开错误。
8. 加载失败、Wasm trap、非法接收者、Proxy trap 与生命周期错误不伪装成领域错误或 `null`；不承诺 panic/OOM 后实例仍可使用。
9. 输出深层冻结；`profile`、`palaces` 独立惰性保存，成功后重复读取保证同一引用，其余查询不缓存。普通子数据不反向持有 Wasm handle；释放后仍可读取已返回数据。

Rust 借用只存活于本次查询；结果进入 JS 后为独立值，不公开指针、线性内存 view、Rust 容器布局或可变共享缓冲区。[wasm-bindgen JsValue](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/jsvalue.html)

## 初始化与线程

入口为 `initialize(...) -> Promise<ReadyZiweiRuntime>`，返回冻结的 `Ziwei`、身份常量及派生方法集合；顶层导出 initializer、类型与不依赖 Wasm 的错误类，不导出原生 holder。参数及错误由[浏览器设计](browser-adapter-design.md)统一说明。

不把初始化改造成每次建盘的 Promise：ready 后建盘、读取和查询仍同步。身份常量也在 ready 阶段从核心导出，避免顶层 `native.identities()` 或在 TS 重写身份派生逻辑。

首版按一个 ESM 模块实例/realm 一个 Wasm 实例设计；相同资源的并发初始化共用 in-flight 结果，失败不缓存半成品。不同资源冲突必须显式失败，不能悄悄重置已有 Natal。生成 glue 本身有模块级 `wasm` 状态，初始化已有实例时直接复用，不能包装成“每次调用一个独立引擎”。[wasm-bindgen 0.2.128 生成源码](https://github.com/wasm-bindgen/wasm-bindgen/blob/0.2.128/crates/cli-support/src/js/mod.rs)

单盘使用同步查询；大量建盘由调用方 Dedicated Worker 调度，每个 Worker 独立初始化和持有命盘。不内置线程池，不共享 handle，不为本阶段新增批量领域 API。传递输入或普通结果；结构化克隆不保留冻结、错误类身份或查询能力。

`--target web` 是 JS glue 的输出模式，`wasm32-unknown-unknown` 才是 Rust 编译目标，二者不能混称。首版不自动加 `bundler`、`nodejs` 多套输出；具体消费验证见浏览器矩阵。[wasm-bindgen 部署说明](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html)

## 生命周期

私有导出类型持有一个核心 `Natal`，只读方法借用它。不要建立全局可增长的数字 handle Map；wasm-bindgen 的生成 holder 已负责指针包装与释放，不增加第二套注册表。

| 候选 | 优点 | 代价 |
| --- | --- | --- |
| GC-only，隐藏 `.free()` | 最接近 Node D-250；调用方不增加资源管理步骤 | 必须验证并约束 FinalizationRegistry 能力；长时间持有 Wasm 实例时，无法控制未回收命盘的占用 |
| Wasm-only 幂等 `dispose()`，GC 兜底 | 长批处理可确定释放核心 holder；可提供可选 `[Symbol.dispose]` 集成 | 新增宿主 Interface 与 use-after-dispose 错误，需要明确不同于 Node |

实现采用第二项：Wasm-only 幂等 `dispose()`，GC 兜底。不往 Node Natal 添加方法，不将生成类的 `.free()` 或指针作为公开契约。

`dispose()` 第一次调用清空私有 holder 引用并释放一次；重复调用成功但不再释放。释放后所有 getter、查询及 `toJSON` 抛生命周期错误，不能因属性已缓存而部分可用。先前返回的快照独立有效；非法 `this` 接收者单独拒绝。公开包不暴露生成类的 `[Symbol.dispose]`；其声明所需的标准库类型仅属于内部构建配置。

wasm-bindgen 默认在支持时使用 FinalizationRegistry，不支持时生成空注册实现，因此不能以“有 GC”推断所有宿主都能自动释放；它只能作兜底，不承诺回调时刻。[官方弱引用说明](https://wasm-bindgen.github.io/wasm-bindgen/reference/weak-references.html)、[固定版本生成源码](https://github.com/wasm-bindgen/wasm-bindgen/blob/0.2.128/crates/cli-support/src/js/mod.rs)

释放 Rust allocation 是归还 Wasm allocator 可复用空间，不承诺线性内存缩小或浏览器 RSS 立即降低。清除整个实例需所有相关 JS 引用不再存活；Worker 终止用于任务隔离，不当作逐盘释放的替代。

## 产物与验收

版本由锁定的 `wasm-bindgen` crate/CLI、Rust/mise 与 Catalog 管理。当前采用 `0.2.128` 与匹配的 js-sys `0.3.105`；Rust 1.98.1 release 构建和最低 1.98.0 目标检查已通过。[官方发布](https://github.com/wasm-bindgen/wasm-bindgen/releases/tag/0.2.128)

| 验收层 | 必须证明的结果 |
| --- | --- |
| 目标可构建 | 锁定工具链下核心与 Adapter 的 `wasm32-unknown-unknown` 构建；无 WASI/Node 导入、无意外共享内存/线程依赖 |
| 私有 seam | 非法数值不先截断、边界年份精确、null 不遗漏、错误 payload 与 receiver 检查；直接调用私有导出测试输入防御 |
| 核心一致性 | 固定命例独立预期 + 同输入 Rust/Node/Wasm 差分；完整宫星顺序、四化、限运与两种入口都覆盖；差分不是规则正确性的唯一证据 |
| 公开 Interface | 所有查询映射、输入捕获、只读、两个属性缓存、单项不物化全盘、`toJSON`、常量派生与类型正负例 |
| 生命周期 | 创建/释放循环、重复释放、释放后访问、异常路径释放、子数据独立、Worker 退出；GC 冒烟不作确定性无泄漏证明 |
| 产物一致性 | 同批 `.wasm`、生成 glue、声明和 ESM 门面封存摘要；只能消费封存 tarball，不在消费任务重新构建 |
| 浏览器/部署 | HTTP 与真实打包消费、Worker、资源失败和 CSP，分别验证所声明浏览器；Node 执行 Wasm 不能替代浏览器证据 |
| 性能与资源 | 下载/编译/初始化、建盘、首次快照、热属性、单查询、批量持有与释放分别测量；不套用原生 Rust/Node 速度或内存阈值 |

不得只检查 `.wasm` 后缀或成功编译就标为支持。必须先在非 COOP/COEP 页面证明单线程方案可运行，再按浏览器文档验证 CSP 与部署限制；真实包依赖图不得出现 `binding.cjs`、`.node`、`node:*` 或 Node 平台包。

Wasm Core features 随 Rust/LLVM 默认值变化；固定 Rust 版本并检查实际模块所需能力，再确定最低浏览器版本。不从“支持 WebAssembly”四字推导所有 Wasm features 均可运行。[Rust feature 说明](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html#enabled-webassembly-features)

## 实施切片、工作量与阻塞项

| 切片 | 内容 | 粗估人日 |
| --- | --- | --- |
| 1 | 确认新宿主 Interface，目标构建、两个入口及 profile/error 垂直切片 | 1–2 |
| 2 | 全部查询、DTO、身份辅助、冻结与两属性缓存，跨 Adapter 合同覆盖 | 2–3 |
| 3 | 生命周期、私有 seam 负例、原始 Wasm/glue 摘要与基础性能/内存基线 | 1.5–2.5 |

以上为设计阶段的 **4.5–7.5 人日** 粗估，不是实际耗时记录；不含浏览器消费矩阵、七个原生平台、正式发布和外部环境等待。当前构建与测试结果见[交付计划](cross-platform-delivery-plan.md)，性能基线另行测量。Wasm 在移动浏览器通过也不构成 Android/OpenHarmony 原生候选的完成证据。

独立路线、包/目录、ready 返回形状与显式释放已进入实现；最低浏览器、设备和部署范围仍须实际验收，不能自动沿用 Node 24.15.0 门槛。

实现仅扩展宿主适配与工程配置，不修改 Rust 核心规则或既有 Node API；未提交、推送或发布。
