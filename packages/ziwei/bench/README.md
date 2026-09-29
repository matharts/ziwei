# Node 公开 API 基准

独立套件 `ziwei-typescript-node-public-512`，version 12。只从 `@matharts/ziwei` 包根导入，在 Node 中直接测量纯 TypeScript ESM 实现，不依赖原生模块或 `target/` 下的临时脚本。D-273 重写了 API 和引擎并修改两项负载；version 4 加入 `decadeYears`，version 5 加入 `palaceTransformationSources`，version 6 加入宫干四化单项及两项首次查询负载，version 7 加入建盘后首次查单宫及按星查宫，version 8 加入建盘后首次查星，version 9 加入建盘后首次读取生年四化，version 10 加入建盘后首次读取自化，version 11 加入首次三方查询及其后补齐十二宫的负载，version 12 加入完整生命周期负载，因此旧版记录不能作为同负载基线。运行器先构建当前包，再在独立 Node 进程中测量。

## 运行方式

从仓库根运行：

```sh
mise run benchmark:node:smoke
mise run benchmark:node
mise run benchmark:node:unique
mise run benchmark:node:unique:palace
mise run check:node:bench
```

不再提供 pnpm 基准脚本。基准 CLI 接受 `--smoke` 和 `--output <新目录>`，`--help` 必须单独使用；不提供基线登记、对比或阈值参数。

### 运行时与输出目录

使用上面的 mise 任务选择项目工具链，并通过 `pnpm exec` 校验 TypeScript 版本。运行器复用 `mise run build:node:ts`，显式用 `--tool node@<当前版本>` 保持构建与计时的 Node 一致；计时进程仍由 `process.execPath` 启动。

报告保存实际 Node/V8 和 mise 版本，不将不同运行时的结果视为同一环境；不改全局 PATH 或 Node 配置。复杂输出路径使用仓库根 `mise exec -- pnpm exec -- node packages/ziwei/bench/run.ts --smoke --output <新目录>`，避免普通任务的 shell 转义。

```sh
mise run benchmark:node:smoke -- --output /tmp/ziwei-node-smoke-new
```

默认记录目录为仓库 `target/benchmarks/node/public-<随机 ID>/`；显式相对路径以进程工作目录为准，以上 mise 任务的工作目录是仓库根。已有目录一律拒绝，不覆盖、不合并。构建需要先按仓库说明安装 mise 工具链及 pnpm 开发依赖；本工具不会安装依赖或发布包。

## 测量合同

### 语料与负载

固定种子 `0x5a172026`，512 Birth + 512 Parameters；包括数字年的 i32 边界、零年、负年，以及有效干支配对。语料 SHA-256 为 `2cbeaeef0fc8b448d4f4dc89e7f10012bb9c2a88fcfd1ede763bd08afdae9f92`，启动及结束均验证。

各批重复使用这批输入对象及其有限的落宫组合。`birthAndFirstPalaces` 包含每张盘首次读取十二宫，但同一组合的星曜数组可能已由此前的盘缓存；因此该指标是重复组合负载，不能代表每张盘都采用新组合时的速度。评估缓存改动时须另测首次出现的组合及内存留存。

`benchmark:node:unique` 是独立临时测量：先用前 512 个有效组合预热 20,000 次，再在同一进程各读取其余 16,768 个年干、月份、紫微地支、时辰组合一次，作为首次组合耗时。随后不计时地再次遍历这些组合以填充缓存，最后计时第三次遍历，得到同语料的缓存命中耗时。两个计时窗口都包含 `fromParameters` 与首次读取十二宫，不含构建、模块导入、语料准备和主动 GC。`benchmark:node:unique:palace` 使用同样的组合与计时边界，但每张盘只首次查询出生时辰对应的一宫；两项命令使用不同的 suite id，不能互作基线。测量脚本输出单行 JSON，包含产物与语料 SHA-256、运行时、两次耗时与每盘均值，以及首次遍历和缓存填充后的 GC 堆差值；堆差值不是单盘占用。它不改变上面的固定语料套件合同，也不登记基线或设置速度门禁；比较两次结果时应分别在新进程中运行并核对产物、语料与运行环境。

完整十二宫临时套件现在为 version 2，单宫临时套件为 version 1；两种模式共用读取函数中的分支，完整十二宫旧版的耗时不能作为同合同基线。

| 操作 | 完整模式每批次数 | 范围 |
| --- | ---: | --- |
| `fromBirth` / `fromParameters` | 各 16,384 | 输入检查与 TypeScript 建盘；不读取宫位 |
| `birthAndFirstPalaces` | 1,024 | 建盘并首次生成、冻结十二宫快照 |
| `birthAndFirstPalace` / `birthAndFirstPalaceByStar` | 各 1,024 | 建盘后首次查询一个宫位／按星查宫，不预先读取十二宫 |
| `birthAndFirstStar` | 1,024 | 建盘后首次按星查询，不预先读取十二宫或建立索引 |
| `birthAndFirstBirthTransformations` | 1,024 | 建盘后首次读取生年四化，不预先读取十二宫 |
| `birthAndFirstSelfTransformations` | 1,024 | 建盘后首次读取自化，不预先读取十二宫 |
| `birthAndFirstSanfang` | 1,024 | 建盘后首次查询三方或四正；地支与 `includeSelf` 独立轮换，不预先读取十二宫 |
| `birthAndSanfangThenPalaces` | 1,024 | 同样轮换三方或四正，再补齐十二宫 |
| `lifecycleBirth` / `lifecycleParameters` | 各 512 | 每次新建盘，读取十二宫、十八星及其落宫、生年四化、自化、十二宫的四化与来源、大限年度摘要；返回盘与校验和使结果逃逸 |
| `birthAndFacts` | 1,024 | 建盘并读取档案、十二宫及五行局 |
| `birthAndFirstPalaceTransformation` / `birthAndFirstPalaceTransformations` | 各 1,024 | 建盘后首次查询一项／四项宫干四化，不预先读取宫位 |
| `palaceStar` | 16,384 | 通过宫位对象查询一颗星曜，包含命中和未命中 |
| `hotPalaces` | 131,072 | 已生成快照的属性读取，不能代表首次读取 |
| `star` | 16,384 | 在预建盘上按十八星身份轮换查询 |
| `birthTransformations` | 2,048 | 生年四化聚合 |
| `selfTransformations` | 1,024 | 自化聚合；完整模式预热后测重复查询 |
| `palaceTransformation` | 16,384 | 在预建盘上按十二地支轮换查询单项宫干四化 |
| `palaceTransformations` | 16,384 | 按十二地支轮换查询宫干四化 |
| `palaceTransformationSources` | 4,096 | 按十二地支轮换反查宫干四化来源 |
| `decade` / `yearly` | 各 4,096 | 大限、流年宫职数组；使用固定的序号循环 |
| `decadeYears` | 4,096 | 大限的十项年度摘要；在预建盘上按十二个大限序号轮换 |

### 采样与计时

完整模式为一个进程内 3 轮 × 每项 7 批，共 546 个样本；逐轮旋转操作顺序。每轮每项先预热 2,560 次，再执行三次强制 GC，各次之间让出事件循环。smoke 为 1 轮 × 1 批，每项预热及测量均为 512 次，共 26 个样本；它只验证流程，不用于速度结论，也不保证每个查询都遍历完整的 1,024 张预建盘。

预建读取语料包含 1,024 张盘，在计时前检查十二宫、十八星与宫位数组冻结，另检查甲子固定命例的武曲化科。所有预建盘均已读取 `palaces`；自化查询和生年四化查询经过完整模式预热后落在重复查询路径，smoke 不保证每张盘都已预热到该路径。名称含 `birthAndFirst` 的负载分别包含相应首次读取成本；`birthAndSanfangThenPalaces` 还包含首次三方查询后的全盘补齐成本。预建盘上的查询不模拟首次读取宫位或首次自化查询。功能正确性仍由独立包测试及核心命例测试验收，不能由这些轻量检查替代。

每批使用 `process.hrtime.bigint()`，保存正整数 `elapsedNs` 与准确的 `operations`。计时循环包含 JS 回调、索引选择和每次结果的全局逃逸写入，不扣除“空循环开销”。日志、主动 GC 与批间让出事件循环不在计时窗口中；窗口内触发的 GC 成本会计入。生命周期负载每次在同一个新盘上读取完整公开查询；它包含的调用与 Rust 基准不同，不能直接把两者数值当作语言差距。结果反映 TypeScript/JavaScript 运行时与该公开 API 的整体成本，不能与 Rust 直接调用基准互作基线。

### 指标与资源保护

记录中的 `medianNsPerOp` 和 `p95BatchMeanNsPerOp` 是各批 `elapsedNs / operations` 的中位数与 nearest-rank P95，**不是单次调用的 P95**，倒数也不是服务容量。所有样本保留，不去掉慢批。进程 RSS 超过 1 GiB 会中止，这是资源保护，不是性能回归门禁；单个构建／测量子进程有十分钟超时。

## 记录与失败

### 记录文件

- `run.jsonl`：原始开始行、逐批样本、完整结束行；`run.stderr.log` 保存原始错误。

- `build.stdout.log` / `build.stderr.log`：构建原始输出；报告另存 mise、pnpm 版本命令输出，并从工作区已安装的 TypeScript 包元数据读取版本。

- `record.json`：校验全部行、顺序、计数、整数范围、语料及运行时身份后生成；含协议、原始样本、统计、Node/V8/OS/CPU、进程前后内存、负载、工具链、Git revision/dirty 和命令状态。

### 指纹与复核

- `fingerprints.source` 覆盖 TypeScript 引擎与共享源码、包构建配置（含 `rslib.config.ts`、`mise.toml`）及锁文件；`artifact` 覆盖 `dist/` 中的 ESM 产物与包入口；`contract` 覆盖三个基准实现文件。各自保留排序后的逐文件 SHA-256 清单与整体哈希。

- 构建后复核源码，测量后再次复核源码、产物和合同；记录运行时实现标记，并验证产物指纹包含 ESM 包入口。不复用未构建的包作为本次结果。

- 相关 Node 运行时环境覆盖项只存变量名与值的哈希，不复制原文。Git 元数据不可用时为 `null`，不假装干净工作树。日志、路径及错误本身仍可能敏感，分享前需要检查。

### 失败处理

- 构建、执行、解析、指纹复核或输出失败会保留原始输出及 `failure.json`，返回非零，不生成有效测量记录。记录目录本身无法创建或参数非法时，没有可写的失败记录。

### 比较边界

基准实现为 `run.ts`、`suite.ts`、`record.ts`，由 Node >=24.15.0 直接执行；类型导入不加载产品包，计时仍加载已构建的 ESM 产物。version 8 保持固定语料与单项统计方法，新增一项首次查星负载，使样本总数和合同指纹变化；旧记录不能直接当作本次基线。

完整模式始终标为 `provisional`，即使工作树干净；smoke 标为 `smoke`。本工具没有正式基线或回归判定能力。供电、电源模式及后台负载需人工控制；这里的哈希和环境记录不等于可复现构建或稳定性证明。

本套件与 Rust construction/read-path、旧临时十八项分层脚本均是不同合同，不能互作基线。语料、预热、循环、采样、输出消费或统计语义变更时应递增套件版本，保留原始记录；版本号不是排盘规则版本。

## 文件职责与 CI

- `suite.ts`：固定语料、操作、采样合同与计时子进程。

- `record.ts`：文件指纹、严格记录校验与批平均统计。

- `run.ts`：CLI、构建、日志、前后复核及成功／失败记录。

- `bench.test.ts`：由 Rstest 的 `node-bench` 项目运行 CLI 与记录合同；包含一次真实包冒烟，以及隔离临时包中的失败测试，不混入 `ziwei` 项目的 `test/*.test.ts` 功能测试。

CI 在 Linux 作业、包功能测试之后串行运行 `check:node:bench`；该命令包含真实 smoke，不再增加重复 smoke 步骤，不在 macOS／Windows 矩阵重复计时。测试中的故障进程不是性能样本。`bench/` 不在 npm `files` 白名单中，不随包发布；已有独立打包消费端测试验证这一边界。

命令的本机通过与 CI 配置检查不代表远端 CI 已通过，也不证明其他 Node／OS／CPU／libc 组合的支持情况。

## 浏览器临时基准

`mise run benchmark:browser` 先构建包，再用 Playwright 在 Chromium、Firefox、WebKit 中分别测量同一份 ESM 产物；首次运行前需执行 `mise run setup:browser`。独立套件 `ziwei-typescript-browser-provisional-512` version 8 输出每个引擎一行 JSON，记录浏览器版本、产物 SHA-256、五次原始批均值和中位数，不登记正式基线或设置速度门禁。version 2 新增 `decadeYears`，version 3 新增 `palaceTransformationSources`，version 4 新增两项四化聚合，version 5 新增 `selfTransformations`，version 6 新增单项宫干四化，version 7 新增首次三方查询及随后补齐十二宫，version 8 新增完整生命周期负载；不同版本的整套负载不能直接比较。

浏览器套件使用 512 个确定的 Birth 输入，测 `create`（仅建盘）、`full`（建盘并首次读取十二宫）、`sanfang`（首次三方或四正查询）、`sanfangThenFull`（随后补齐十二宫）、`lifecycle`（新建盘并读取十二宫、十八星及落宫、生年四化、自化、十二宫的四化与来源、大限年度摘要），以及 `palaceStar`、`star`、`decadeYears`、`palaceTransformationSources`、`palaceTransformations`、`palaceTransformation`、`birthTransformations` 和 `selfTransformations`（预建盘热查询）。每项预热 20,000 次，再执行五批；`create`、`full`、`sanfang`、`sanfangThenFull`、`lifecycle` 各为每批 65,536 次，`palaceStar` 与 `star` 分别为 524,288 和 1,048,576 次，其余各为 131,072 次。自化测量经过预热，反映保留筛选引用后的重复查询。计时使用页面的 `performance.now()`；浏览器的计时分辨率、GC 和 JIT 状态可能影响短查询，原始批均值须与中位数一起看。输入对象与落宫组合跨批重复，因此 `full` 和 `lifecycle` 均不能代表每次都是新组合。此套件与上面的 Node 套件语料、循环和计时环境不同，数字不能互作基线。

临时 A/B 实验若在同一页面加载两个 ESM 副本，应先做 A/A 测量并交换两版本的加载位置。本机 Firefox 的按宫名查询曾在两份完全相同的代码之间出现明显的位置偏差；此时须用单版本隔离测量交叉复核，不能直接把双模块的耗时差归因于源码变更。
