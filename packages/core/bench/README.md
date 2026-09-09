# Node 公开 API 基准

独立套件 `ziwei-node-public-512`，version 1。只从 `@ziweijs/core` 包根导入，不读取私有原生入口，也不依赖 `target/` 下的临时脚本。运行器先构建当前本机 release 原生包与 TypeScript 门面，再在独立 Node 进程中测量。

## 运行方式

从仓库根运行：

```sh
mise run benchmark:node:smoke
mise run benchmark:node
mise run check:node:bench
```

不再提供 pnpm 基准脚本。基准 CLI 接受 `--smoke` 和 `--output <新目录>`，`--help` 必须单独使用；不提供基线登记、对比或阈值参数。

### 运行时与输出目录

使用上面的 mise 任务选择项目工具链，并通过 `pnpm exec` 校验开发版本。运行器复用 `mise run build:node`，显式用 `--tool node@<当前版本>` 保持构建与计时的 Node 一致；计时进程仍由 `process.execPath` 启动。

报告保存实际 Node/V8 和 mise 版本，不将不同运行时的结果视为同一环境；不改全局 PATH 或 Node 配置。复杂输出路径使用仓库根 `mise exec -- pnpm exec -- node packages/core/bench/run.ts --smoke --output <新目录>`，避免普通任务的 shell 转义。

```sh
mise run benchmark:node:smoke -- --output /tmp/ziwei-node-smoke-new
```

默认记录目录为仓库 `target/benchmarks/node/public-<随机 ID>/`；显式相对路径以进程工作目录为准，以上 mise 任务的工作目录是仓库根。已有目录一律拒绝，不覆盖、不合并。构建需要先按仓库说明安装 mise 工具链及 pnpm 开发依赖；本工具不会安装依赖或发布包。

## 测量合同

### 语料与负载

固定种子 `0x5a172026`，512 Birth + 512 Parameters；包括数字年的 i32 边界、零年、负年，以及有效干支配对。语料 SHA-256 为 `2cbeaeef0fc8b448d4f4dc89e7f10012bb9c2a88fcfd1ede763bd08afdae9f92`，启动及结束均验证。

| 操作 | 完整模式每批次数 | 范围 |
| --- | ---: | --- |
| `fromBirth` / `fromParameters` | 各 16,384 | 输入检查、跨语言调用、Rust 建盘与 JS 句柄包装；不读取宫位 |
| `birthAndFirstPalaces` | 1,024 | 建盘并首次生成、冻结十二宫快照 |
| `birthAndToJSON` | 1,024 | 建盘并生成完整 JSON 对象 |
| `birthAndStringify` | 1,024 | 建盘并序列化为 JSON 字符串 |
| `hotPalaces` | 131,072 | 已生成快照的属性读取，不能代表首次读取 |
| `star` | 16,384 | 在预建盘上按十八星身份轮换查询 |
| `birthTransformations` | 2,048 | 生年四化聚合 |
| `selfTransformations` | 1,024 | 自化聚合 |
| `palaceTransformations` | 16,384 | 按十二地支轮换查询宫干四化 |
| `decade` / `yearly` | 各 4,096 | 大限、流年宫职数组；使用固定的序号循环 |

### 采样与计时

完整模式为一个进程内 3 轮 × 每项 7 批，共 252 个样本；逐轮旋转操作顺序。每轮每项先预热 2,560 次，再执行三次强制 GC，各次之间让出事件循环。smoke 为 1 轮 × 1 批，每项预热及测量均为 512 次，共 12 个样本；它只验证流程，不用于速度结论，也不保证每个查询都遍历完整的 1,024 张预建盘。

预建读取语料包含 1,024 张盘，在计时前检查十二宫、十八星与宫位数组冻结，另检查甲子固定命例的武曲化科。所有预建盘均已读取 `palaces`，查询结果本身不预先缓存；这不模拟从未读取宫位的冷查询。功能正确性仍由独立包测试及核心命例测试验收，不能由这些轻量检查替代。

每批使用 `process.hrtime.bigint()`，保存正整数 `elapsedNs` 与准确的 `operations`。计时循环包含 JS 回调、索引选择和每次结果的全局逃逸写入，不扣除“空循环开销”。日志、主动 GC 与批间让出事件循环不在计时窗口中；窗口内触发的 GC 成本会计入，但不保证原生 finalizer 在本批完成。因此纯建盘不能等同于 Rust 的确定性构造与析构全生命周期。

### 指标与资源保护

记录中的 `medianNsPerOp` 和 `p95BatchMeanNsPerOp` 是各批 `elapsedNs / operations` 的中位数与 nearest-rank P95，**不是单次调用的 P95**，倒数也不是服务容量。所有样本保留，不去掉慢批。进程 RSS 超过 1 GiB 会中止，这是资源保护，不是性能回归门禁；单个构建／测量子进程有十分钟超时。

## 记录与失败

### 记录文件

- `run.jsonl`：原始开始行、逐批样本、完整结束行；`run.stderr.log` 保存原始错误。

- `build.stdout.log` / `build.stderr.log`：构建原始输出；另存 mise、pnpm、Rust 版本命令输出。

- `record.json`：校验全部行、顺序、计数、整数范围、语料及运行时身份后生成；含协议、原始样本、统计、Node/V8/OS/CPU、进程前后内存、负载、工具链、Git revision/dirty 和命令状态。

### 指纹与复核

- `fingerprints.source` 覆盖引擎／绑定／TS 源码、构建配置（含 `rslib.config.ts` 与定义构建步骤与参数的 `mise.toml`）及锁文件；`artifact` 覆盖实际本机原生库、加载器、JS、声明和包入口；`contract` 覆盖三个基准实现文件。各自保留排序后的逐文件 SHA-256 清单与整体哈希。

- 构建后复核源码，测量后再次复核源码、产物和合同；验证实际加载的 `.node` 文件在产物清单中。拒绝 `NAPI_RS_NATIVE_LIBRARY_PATH` 外部替换，不复用未构建的包作为本次结果。

- 相关 Node／Rust／Cargo 编译环境覆盖项只存变量名与值的哈希，不复制原文。Git 元数据不可用时为 `null`，不假装干净工作树。日志、路径及错误本身仍可能敏感，分享前需要检查。

### 失败处理

- 构建、执行、解析、指纹复核或输出失败会保留原始输出及 `failure.json`，返回非零，不生成有效测量记录。记录目录本身无法创建或参数非法时，没有可写的失败记录。

### 比较边界

基准实现为 `run.ts`、`suite.ts`、`record.ts`，由 Node >=24.15.0 直接执行；类型导入不加载产品包，计时仍加载已构建的 ESM 产物。此次 TS／ESM 迁移不改变固定语料、采样和统计协议，但实现文件与包产物指纹已变化，旧记录不能直接当作本次基线。

完整模式始终标为 `provisional`，即使工作树干净；smoke 标为 `smoke`。本工具没有正式基线或回归判定能力。供电、电源模式及后台负载需人工控制；这里的哈希和环境记录不等于可复现构建或稳定性证明。

本套件与 Rust construction/read-path、旧临时十八项分层脚本均是不同合同，不能互作基线。语料、预热、循环、采样、输出消费或统计语义变更时应递增套件版本，保留原始记录；版本号不是排盘规则版本。

## 文件职责与 CI

- `suite.ts`：固定语料、操作、采样合同与计时子进程。

- `record.ts`：文件指纹、严格记录校验与批平均统计。

- `run.ts`：CLI、构建、日志、前后复核及成功／失败记录。

- `bench.test.ts`：由 Rstest 的 `node-bench` 项目运行 CLI 与记录合同；包含一次真实包冒烟，以及隔离临时包中的失败测试，不混入 `core` 项目的 `test/*.test.ts` 功能测试。任务迁移只改变构建调用与工具追溯，不改变测量协议。

CI 只在 `native-tests` 的 Linux 作业、包功能测试之后串行运行 `check:node:bench`；该命令包含真实 smoke，不再增加重复 smoke 步骤，不在 macOS／Windows 矩阵重复计时。测试中的故障进程不是性能样本。`bench/` 不在 npm `files` 白名单中，不随包发布；已有独立打包消费端测试验证这一边界。

命令的本机通过与 CI 配置检查不代表远端 CI 已通过，也不证明其他 Node／OS／CPU／libc 组合的支持情况。
