# 建盘与查询基准

当前有两套 Rust 负载和一套独立 Node 负载：下文首先说明 construction-120，它仅测 `Ziwei::from_birth` 和 `Ziwei::from_parameters`；随后说明 Rust 混合输入与读路径套件。Node 公开 API 使用独立的 [ziwei-node-public-512](../../packages/core/bench/README.md)。不能用建盘结果宣称查询延迟，也不能将不同套件互作基线。

当前生产设计为紧凑 Star + ArrayVec + 私有星曜位置索引，实现与取舍见 [包架构](../architecture/rust-package-design.md)。性能结论应按本文约定记录负载、源码与环境；不同实现或不同负载的历史结果不能作为当前正式基线。

`crates/ziwei/benches/suite.rs` 固定 120 项输入、顺序与测量参数；`construction.rs` 负责计时。输入值类型在计时前构造，计时内包含建盘、`black_box` 和命盘释放，不含历法换算、输入校验、序列化或读取查询。每项入口有 5 次语料预热遍历，每轮 31 批，每批遍历语料 64 次，共 7,680 张盘。整个校准默认重复 20 轮。

报告 median / P95 是**每批平均 ns/chart** 的统计，不是每次调用的尾延迟。跨轮 CV 基于各轮中位数；建议退化阈值 `max(5%, 3 × CV)` 只是人工审定的起点，不是自动验收线或统计置信区间。

## 命令

以下命令及正式基线机制仅适用于 Rust 两套负载。Node 使用 `mise run benchmark:node:smoke`、`mise run benchmark:node`；`mise run check:node:bench` 验证 CLI、记录合同和真实冒烟，不经过 Rust xtask。Node 记录始终为 smoke／provisional，没有登记正式基线或性能门禁的入口。

```sh
mise run benchmark:smoke
mise run benchmark:calibrate -- --runs 20
```

结果放入 `target/benchmarks/<自动记录 ID>/`，包含构建输出、逐轮原始 CSV／JSON、汇总 JSON、中文说明和每轮中位数 SVG。既有记录不覆盖。原始 stdout／stderr 在解释输出前保存；参数与基线预检通过后，构建、执行、解析、复核或输出失败会留下 `failure.json`，记录失败阶段、命令、退出码及错误，不生成有效汇总。失败记录不能作为正式基线。

有效报告 JSON 在控制台写入及刷新成功后最后创建；stdout 管道关闭等写入错误按正常错误处理并留证，不通过 panic 退出。环境复核及正式基线的 Git 复核命令也进入 `commands`，以 `verify` 阶段保存退出码和原始 stdout／stderr；预检仍在记录目录创建前进行。

`suite_id`、`suite_version`、`contract_fingerprint` 固定比较身份；指纹涵盖语料、计时实现、记录器和 Cargo 配置。源码另有指纹，所以允许在相同测量合同下对比不同实现。变更语料或计时方式时应递增套件版本；这不是排盘规则版本。

两套记录器由独立 Rust 开发工具 `tools/xtask` 实现，通过上述 mise 任务调用。`mise run check:tools` 执行格式、Clippy 和快速测试，覆盖统计、CSV 合同、基线比较、失败留证及命令行；默认不运行真实基准负载。`mise run check:tools:e2e` 单独串行运行两套真实冒烟，并校验输出合同；Unix 平台额外以关闭 stdout 和复核命令非零退出验证失败留证。这些故障测试同样默认忽略，不用于性能结论。

`contract_fingerprint` 只包含测量与记录路径实际使用的工具源码（`lib.rs`、`main.rs`、`benchmark.rs`、`record.rs`、`support.rs`）、对应套件负载、核心与工具 manifest、工具 lockfile；打包检查的 `package.rs` 不参与比较身份。共享依赖或共享工具文件的变更仍保守地使两套合同失配。另以 `recorder_fingerprint` 记录全部工具源码、工具 manifest 与 lockfile，供追溯，不作为比较门槛。因此仅修改打包检查源码会更新追溯指纹，不会使测量合同失配。

迁移前及本次指纹策略变更前的旧记录不能直接作为新工具的比较基线，需重新校准和登记。读取计时协议仍为下述 version 2；construction-120 的负载、CSV 和 version 1 不变。统计内部使用明确的 `Summary` 类型，既有 JSON 统计字段及算法保持不变。记录 ID 是不透明标识，时间读取 `observed_at`，不从目录名推导。

## 正式基线与比较

先检查临时校准的波动，在同一台空闲、供电和电源模式一致的机器上采集；关闭高负载后台任务。正式基线必须使用**干净工作树**和显式、稳定的机器标识：

```sh
ZIWEI_BENCH_RUNNER=dedicated-mac-arm64 mise run benchmark:calibrate -- --runs 20 --record-baseline
mise run benchmark:calibrate -- --runs 20 --baseline target/benchmarks/<记录 ID>/report.json
```

比较时也需设置与基线相同的 `ZIWEI_BENCH_RUNNER`。环境、工具链、套件指纹、轮数不一致，或基线不是干净状态的正式记录，一律拒绝。仅当人工审定后，才添加 `--max-regression 0.15` 之类的明确阈值；超出时命令退出非零，同时保留报告。

环境身份包含当前 profile 的配置、`bench` 继承的 `CARGO_PROFILE_RELEASE_*`、增量编译和目标 rustflags／linker／runner 等覆盖项；测量结束后重新采集并比较，不缓存复核结果。相关编译变量含非 UTF-8 值时明确报错；无关变量不会使记录器崩溃。

当前未提交工作树产生的报告只能标为 `provisional`，不能晋升为正式基线。不得为了采集基线擅自提交或清理用户的改动。CPU 型号和 runner ID 会记录在本地报告中，对外分享前应检查。

共享 GitHub runner 对 construction-120 与 read-path-512 都只跑 smoke，不作性能回归门禁；两套 smoke 仅在 Ubuntu 的 `quality` job 串行执行，不在平台矩阵中重复计时。MSRV 与默认工具链各保留一次端到端验证：前者由 `check:msrv` 显式执行，后者由 `check:tools:e2e` 执行；不再从快速测试和额外 smoke 步骤重复运行同一工具链的负载。CI 配置采用 [actions/checkout](https://github.com/actions/checkout) 与 [jdx/mise-action](https://github.com/jdx/mise-action) 官方用法，并固定到完整提交 SHA；没有对应提交的实际运行结果，就不能声称远端 CI 已通过。

## 独立混合输入与读路径套件

`benches/read_path.rs` 定义 `ziwei-read-path-512`（version 2、种子 `0x5a172026`），由 `examples/benchmark_read_path.rs` 运行。不修改上面的 construction-120 语料、计时或 Cargo 配置；两套结果不能互作基线。单版本运行器用于复跑与观察，不能将两个独立进程的一次结果当作严格配对实验。

```sh
rtk mise exec -- cargo run --release -p ziwei --example benchmark_read_path -- --smoke
rtk mise exec -- cargo run --release -p ziwei --example benchmark_read_path -- --output /tmp/ziwei-read-path.csv
rtk mise exec -- cargo build --release -p ziwei --example benchmark_read_path
rtk proxy /usr/bin/time -l target/release/examples/benchmark_read_path --memory
```

输出文件通过 `create_new` 创建，已有文件会拒绝覆盖。CSV 头包含套件 ID、版本、每入口输入数和种子；其余行是 `sample,操作,轮次,样本,批次数,操作数,总时长ns`。总时长保留整数纳秒，`xtask` 校验批次数和操作数后计算 `ns/单位 = 总时长 / 操作数`，不再从四舍五入的平均值反推批时长。完整运行 20 轮 × 31 样本，轮次间轮换操作顺序；smoke 为 1 × 1。该运行器不记录完整机器和源码指纹，不提供正式基线登记；保存结果时须同时记录主机、工具链、源码与负载哈希。配对实验可用同一宏对两个 crate 实例化负载；不得维护两份算法不同的基准实现。

每个计时样本包含一批或多批下表中的原始负载。version 2 的完整测量仅对 `palace_star` 和 `self_transformations` 连续执行 16 批，分别计入 786,432 次查询和 524,288 次整盘遍历；其他十六项仍为单批。smoke 全部为单批，保持快速冒烟。每项全局预热仍为 5 批，不增加每轮额外预热，也不改变命中分布、迭代器消费或核心算法。

较长批次用于减小短时扰动对平均值的影响，不保证波动消失。不要丢弃慢轮或通过放宽阈值掩盖波动；稳定性不足时，只作描述性结果，不用来判定几个百分点的性能变化。

| 操作 | 语料及每批次数 | 单位与计时范围 |
| --- | --- | --- |
| from_birth / from_parameters | 每入口 512 个混合输入 × 16 | ns/盘，创建和立即销毁 |
| retain_birth / retain_parameters | 每批 512 盘同时存活，重复 16 次 | ns/盘，包含外层 Vec 与各批统一销毁 |
| star / palace_by_star | 1,024 盘 × 十八星，固定种子打乱，重复 2 次 | ns/查询 |
| palace_star | 1,024 盘 × 十二宫的固定目标星，含命中和未命中，重复 4 次 | ns/查询；借用宫位处设 black_box，防止与定位代码过度融合 |
| birth_transformations / self_transformations | 1,024 盘 × 32 | ns/整盘聚合；自化迭代器完整消费，不只构造迭代器 |
| palace_transformations / decade / decade_years / yearly / palace_by_name | 1,024 盘 × 12 个查询组合 × 4 | ns/查询；命盘在计时前构造 |
| names_hot / names_mixed | 同一盘热点 / 1,024 盘遍历，各 147,456 星 | ns/星，包含遍历及四个名称／简称 getter，不含字符串复制 |
| lifecycle_birth / lifecycle_parameters | 512 输入 × 4 | ns/完整场景：创建、全部名称、十八次 star 和 palace_by_star、生年与自化聚合、十二宫四化、销毁；不是任一单独操作的延迟 |

出生语料含 `i32::MIN`、`i32::MAX`、零年与负数年份，直接参数保持有效六十甲子；两种入口各 512 盘。所有语料构造与合法性检查在计时外。峰值 RSS 模式在独立进程额外保留 32,768 张盘，包含分配器、运行时、预建语料和进程开销，不等于单个命盘占用或请求字节数。

解读小差异前先做 A/A 对照，并分开检查建盘、查找、聚合、名称和完整生命周期。改变语料、屏障或计时边界后重做 A/A；不要将旧负载的有利结果迁移到新负载。`benchmark_read_path` 测试验证语料与完整查询事实可重现、十八个负载的实际执行计数，以及完整测量与 smoke 的采样次数和批时长。

### 读取基准记录与比较

原始 Rust 运行器保留上述 CSV 与计时合同；未知／重复参数、缺失输出路径和冲突模式会在创建负载前失败。`--memory` 不能与 `--smoke` 或 `--output` 同用，输出文件仍禁止覆盖。

使用 `tools/xtask` 的 `benchmark-read` 子命令自动记录环境与测量结果，对外仍通过 mise 调用：

```sh
mise run benchmark:read:smoke
mise run benchmark:read:calibrate
ZIWEI_BENCH_RUNNER=dedicated-mac-arm64 mise run benchmark:read:calibrate -- --record-baseline
ZIWEI_BENCH_RUNNER=dedicated-mac-arm64 mise run benchmark:read:calibrate -- --baseline target/benchmarks/read-path/<记录 ID>/record.json
```

校准保持一个进程内 20 轮 × 31 样本、逐轮旋转十八项操作，使用 version 2 的逐项批次协议，smoke 为 1 × 1；不同于 construction-120 的多进程重复，不能互作基线。每次在 `target/benchmarks/read-path/<记录 ID>/` 独占创建 `raw.csv` 和 `record.json`，不生成版本控制内的报告文档。

记录包含套件／源码／完整工具追溯指纹、Git 状态、CPU、Rust/Cargo 版本、release 编译环境及 Cargo 配置哈希、原始样本、median、批平均值 P95 和跨轮 CV。`commands` 记录构建、测量与复核命令、退出码及 stdout／stderr 文件位置；失败留证规则与建盘套件相同。`sampling` 按操作记录 `batches_per_sample`、`operations_per_sample`；`batch_elapsed_ns` 按轮次、操作和样本保存整数纳秒总时长；`rounds` 保留归一化后的平均耗时供汇总。配置只存哈希，不存原文；主机名、路径和错误输出仍可能包含敏感信息，对外分享前检查。供电、系统负载等实验条件仍须人工控制。

读取基线同样要求干净工作树和显式 runner ID；负载、环境、样本数量或 `sampling` 不一致时拒绝比较。version 1 的 CSV 和基线不能用于 version 2；协议变更后的数字变化不是引擎优化收益。测量中源码／环境变化时只保留原始数据，不生成有效记录。`--max-regression` 只有在指定基线且给出有限非负比例时才可使用，默认没有性能门禁；超阈值保留记录并退出非零。共享 CI 仍只执行 smoke。

### 消费端编译配置实验（2026-09-07）

本次在 Apple M4 Max、Rust 1.98.1 上，用独立消费端复用当时的 read-path-512 version 1 运行器；以下历史结果不作为 version 2 的基线。每种配置串行执行三次全新 Cargo 目标目录构建（操作系统缓存未清空），再轮换配置顺序，各运行三组 20 轮 × 31 样本。以下为该消费端产物和批平均值的中位数，不是核心库单独的大小或正式性能基线；未提交源码、完整环境和原始 CSV 保存在本机 `target/` 实验目录。

| 消费端配置 | 构建中位数 | 可执行文件字节数 | `palace_star` ns/查询 | 完整生命周期 ns/盘（Birth / Parameters） |
| --- | --- | --- | --- | --- |
| 默认 release | 0.608 s | 538,640 | 3.735 | 250.793 / 242.177 |
| Thin LTO | 1.790 s | 530,560 | 1.526 | 250.977 / 240.957 |
| Thin LTO + `codegen-units = 1` | 1.901 s | 510,176 | 1.653 | 250.173 / 240.692 |

Thin LTO 在三组复测中都降低了宫内查星开销，但建盘及完整生命周期没有稳定、明显的整体收益。叠加单 codegen unit 后，建盘中位数高约 2.2%～2.3%，自化聚合高约 7.9%；不能只挑查星结果宣称整个引擎更快。当前保留默认配置，宫内查星占比较高的上层应用可按自己的实际负载试验 Thin LTO。

这些配置只在消费端工作区根设置，不写入核心库以强制调用方使用；Cargo 的 profile 归属见 [官方文档](https://doc.rust-lang.org/cargo/reference/profiles.html)。重新测量时同时记录构建成本、文件大小和十八项操作，不能将本节不同配置的结果直接交给同环境基线比较器。

同次实验还验证了 `Natal::birth_transformations` 的显式定位复用：同源 A/A 已有约 -3.38% 的配对偏差，候选在两次 A/B 中分别为 +0.61% 和 +0.71%，没有可重复的查询收益。候选通过事实一致性与测试，但不合入；保留现有实现，也不据此断言编译器生成了相同代码。
