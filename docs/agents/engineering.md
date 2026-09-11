# 工程验证

## 工具链与检查入口

### Rust 与检查范围

Rust 命令通过 `mise` 执行：直接调用使用 `rtk mise exec -- <command>`，仓库任务使用 `rtk mise run <task>`。工具链版本和任务以 [mise.toml](../../mise.toml) 为准，MSRV 以适用的 Cargo manifest 为准；验证 MSRV 使用仓库对应任务。

开始验证前，按变更范围读取 [CI 配置](../../.github/workflows/ci.yml)、[Git 钩子](../../lefthook.yml) 和相关 Cargo manifest，确定适用检查及参数。本地钩子只覆盖部分检查，钩子通过不能代替完整 CI 结果。

### Node 版本与职责

Node 开发统一从仓库根使用 mise 任务，完整命令、工作目录和执行顺序只定义在 [mise.toml](../../mise.toml)；根及 `packages/ziwei/package.json` 不再包含开发 scripts。mise 安装并选择工具链；根 [package.json](../../package.json) 的 `devEngines` 校验 Node `>=24.15.0` 与 pnpm `12.4.1`，两者均为 `onFail: "error"`。

pnpm 由 mise 安装，只有 macOS x64 使用 `npm:pnpm` 后端，因为当前 Aqua 后端排除该平台。npm 安装仅允许 pnpm 自身的脚本将占位入口替换为平台二进制。其余平台使用 Aqua 原生可执行入口；Windows 的 npm `.cmd` shim 无法保留复杂参数。工具别名仍为 `pnpm`，不改变 workspace 包管理器或开发版本约束。

[.miserc.toml](../../.miserc.toml) 启用平台配置自动选择；[macOS x64 配置](../../mise.macos-x64.toml) 只覆盖后端，工具版本仍只定义在主配置。隔离工程夹具需一并复制这两个文件，才能验证真实的平台选择。

Node 任务通过 `pnpm exec` 执行，因此仍先经过开发版本校验；不配置自动下载，也不使用 workspace 的 `runtimeOnFail`／`pmOnFail` 覆盖 manifest。子包 `engines.node` 保留消费端最低版本约束，不重复 `devEngines`；根私有 workspace 不使用 `engines` 或旧 `packageManager` 字段。

字段职责见 [pnpm devEngines](https://pnpm.io/package_json#devenginesruntime) 与 [npm engines](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#engines)。

### 任务顺序

`build:node` 顺序调用 `build:node:native`、`build:node:ts`；`check:node` 等待构建成功，再顺序运行 `test:node`、`check:node:types`。使用有序的 `run` 任务步骤表达顺序，不依赖 `depends` 数组的排列。

聚合任务用于固定流程，工具选项传给对应单项任务，不再通过聚合 build 将参数隐式传给最后一步。Node 单项任务执行 `pnpm exec -- node <已安装 CLI 路径> ...`，不调用自建调度器、pnpm scripts 或工具的 `.cmd` shim；不隐式触发 pre/post 生命周期。CLI 路径由依赖 manifest 的 `bin` 核验，升级依赖时由入口测试发现路径变更。

### 运行时选择

项目 `mise.toml` 启用 `activate_aggressive`，确保工具目录即使已在 CI 的 PATH 中，也会重新置顶；不依赖交互式 shell 的激活记录，不改全局 PATH。无需在普通任务内部再次调用 mise。最低版本检查显式用 `mise run --tool node@24.15.0` 复用单项任务，不复制构建或测试命令。入口测试核对 mise、开发约束和消费端门槛一致，并验证错误 Node／pnpm 版本会阻止安装和命令执行。

### 参数传递

供工具自身解析的 glob 在 mise 任务中使用双引号包裹；Windows 默认 shell 会把单引号原样传入参数。

普通选项可用 `mise run test:node -- -t palace`。mise 的普通内联任务仍经过平台 shell，不承诺任意参数保真。包含换行、尾随反斜杠、变量字面量等复杂参数时，从仓库根使用 `mise exec -- pnpm exec -- node node_modules/@rstest/core/bin/rstest.js --project ziwei <参数...>`；其他工具同样直接启动其 CLI，并使用对应任务的工作目录。

调用 shell 本身仍需正确引用参数。pnpm 12.3.4 的 Windows `run` 即使启用 `shellEmulator` 也可能改写这些参数，不能重新包一层 `pnpm run`。[pnpm 脚本拼接](https://github.com/pnpm/pnpm/blob/v12.3.4/pnpm/crates/executor/src/run_script.rs#L238)、[mise 直接执行](https://mise.jdx.dev/cli/exec.html)与 [mise 任务执行](https://mise.jdx.dev/tasks/architecture.html)说明了各层的区别。

### 工具回归

`mise run check:node:tools` 验证真实 mise 任务的 PATH 遮蔽、有／无激活记录、嵌套 Node、工作目录、执行顺序和每一阶段的失败传播。复杂参数统一通过文档规定的直接 CLI 入口验证，覆盖空白、中文、引号、换行、尾随反斜杠、变量、通配符及 pnpm 同名选项；不重复遍历各工具，也不要求第三方工具的已知错误持续存在。

路径使用原生 realpath 比较。CI 在各平台包测试前执行，不触发性能测量；本机通过不能替代 Windows 实机验收。工具测试只信任自己创建的临时 mise 配置，不修改全局信任列表。Rslib 隔离夹具显式提供 TypeScript 依赖，不依赖工具 bin shim 注入的 `NODE_PATH`。

## Node 构建与类型检查

### Lint 与格式化

Node 工程使用 [Oxlint](https://oxc.rs/docs/guide/usage/linter/quickstart) 和 [Oxfmt](https://oxc.rs/docs/guide/usage/formatter/quickstart.html)，版本由根 Catalog 管理。任务入口为 `mise run lint:node`、`mise run check:node:format`；需要写入时使用 `mise run lint:node:fix` 或 `mise run format:node`。命令与文件范围以 [mise.toml](../../mise.toml) 为准，不添加第二套 package scripts。

Oxlint 的 correctness 规则作为基础门禁，警告同样导致失败；安全修复不包含建议或危险修复。TypeScript 类型合同仍由独立类型检查负责，不用 lint 替代。配置分别位于根 [.oxlintrc.json](../../.oxlintrc.json) 与 [.oxfmtrc.json](../../.oxfmtrc.json)，编辑器复用相同配置。

Oxfmt 的导入排序配置显式定义来源分组、升序、大小写和分区行为；`@matharts/` 归入内部命名空间，类型导入仍随来源分组并保留 `import type` 语义。空行不阻断排序，注释作为分区边界；不另设导入排序 lint 规则。行业实例、官方默认与项目取舍见[导入排序对照](../engineering/import-sorting.md)。package.json 键排序以 `sortPackageJson` 配置为准。

`sortSideEffects: false` 只固定副作用导入自身的位置，普通导入仍可能跨过它排序；有初始化先后依赖的导入块须用注释划定边界。

Oxfmt 读取根 [.editorconfig](../../.editorconfig)：TypeScript 和 JSON 使用两空格缩进，Rust 继续使用四空格。[.gitattributes](../../.gitattributes) 将文本检出为 LF，与 EditorConfig 保持一致，不依赖个人 `core.autocrlf` 设置。隔离测试复制相同的配置，并通过真实 Git checkout 验证换行规则。

当前覆盖包源码、配置、测试、基准工具与根 Node 配置；文档草案不纳入这一门禁，`native/`、`dist/`、`target/` 和依赖目录明确忽略。提交钩子与 CI 只检查，不自动修复或暂存文件；Rust 继续使用 rustfmt 和 Clippy。最低 Node 检查同时验证 Oxc 入口。工具测试验证错误退出、格式检查只读、生成文件忽略，以及实际 mise 任务的参数和运行时选择。

### 产物与模块模式

`build:node:ts` 使用 Catalog 锁定的 Rslib，配置位于 [rslib.config.ts](../../packages/ziwei/rslib.config.ts)。采用 `bundle: false`、单份 ESM 与 ES2022 输出，保持 `dist/*.js` 和 `dist/*.d.ts` 路径；根包和 TS 包均为 `type: module`。

`import` 与 `require(ESM)` 解析到同一入口，不再维护 CJS 实现或桥接文件。公开模块图不允许 top-level await。`native/binding.cjs` 与 `.node` 由 napi 生成，外置并交给 Node 加载。

### 运行时与 TypeScript

最低版本统一为 Node `>=24.15.0`：内置 TypeScript 类型擦除在 24.12.0 稳定，`require(ESM)` 在 24.15.0 稳定，见 [Node TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html) 与 [require(ESM)](https://nodejs.org/docs/latest-v24.x/api/modules.html#loading-ecmascript-modules-using-require)。

这是项目支持门槛，不表示更早版本无法执行生成的 JS。mise 开发版本固定 24.21.0；`check:node:minimum` 在 Linux CI 运行最低版本的完整工程检查。macOS 双架构与 Windows arm64 的最低版本消费验收直接复用封存包与注册表任务，不调用会重新构建的聚合检查。

手写源码、测试、Worker、配置和工具全部使用 `.ts`；Node 直接执行工具的可擦除 TS 语法，保留 `.ts` 导入扩展名，不依赖 tsx。根 `tsconfig.json` 严格检查这些文件，并启用 `erasableSyntaxOnly`、`verbatimModuleSyntax`；`mise run check:typescript` 需在产品构建后运行。

库源码仍通过 Rslib 分发生成的 JS，不在 node_modules 内直接执行 TS。负例通过 `invoke` 或有说明的 `@ts-expect-error` 测试运行时拒绝，不放宽公开类型。

### 原生分发验收

`mise run pack:node -- --target <Rust target>` 对已构建产物生成独立私有暂存包，不隐式构建或发布；布局、平台批次和完整性边界见 [Node 分发设计](../architecture/node-distribution-proposal.md)。`packages/ziwei/tools/pack.ts` 负责实际组装，不是第二套任务调度器。

CI 的 `capture:node` 在目标消费端通过后封存实际测试的 tarball；`assemble:node` 仅汇总当前提交、run ID 和 attempt 的完整目标集，不重新编译。真实批次失败后需要重跑全部任务，不能把只重跑失败 job 的产物混入前一 attempt。完整交付以 `batch.json` 为完成标记，校验边界、产物保留及注册表验收区别见[同批产物封存与汇总](../architecture/node-distribution-proposal.md#同批产物封存与汇总)。

musl 使用 `CARGO_BUILD_TARGET` 指定目标，运行 `mise run build:node:musl`。此任务锁定 Zig／cargo-zigbuild 并复用原生与 TS 构建；`build:node:native --cross-compile` 将选项传给 napi，不传入 `--` 后的 Cargo 参数。普通 `build:node` 不需要交叉链接工具链。

musl 注册表任务保留当前 Node 消费测试，并追加固定摘要的最低 Node 双架构镜像验收；容器内直接执行 `compatibility.ts --musl-runtime <x64|arm64>`，等价的工程入口是 `check:node:musl-runtime`。它核对实际运行环境，不构建产物；版本、镜像和同批消费证据分别保存，边界见 [Linux musl 最低 Node 验收](../architecture/node-distribution-proposal.md#linux-musl-最低-node-验收)。

GNU CI 使用 `build:node:gnu`，在 Linux x64／arm64 上经 `--use-napi-cross` 构建，再执行 `test:node` 与 `check:node:types`。完整汇总上传前运行 `check:node:glibc -- <完整交付目录>`，需要 GNU `readelf`，拒绝超过 glibc 2.28 的版本需求；随后同批 tarball 在实际 glibc 2.28／最低 Node 容器中复用注册表合同。构建任务本身不代表最低环境验收已通过；具体边界见 [GNU 验收目标](../architecture/node-distribution-proposal.md#gnu-glibc-228-验收目标)。

`check:node:macos -- <完整交付目录>` 直接检查两个 macOS tarball 的 Mach-O 元数据，无需 Apple 工具链。macOS 注册表任务先审计同批产物，再分别以开发版本和最低 Node 运行既有 npm／pnpm 消费合同；审计结果与最低 Node 日志按目标保存。系统标记上限和依赖路径约束只构成静态门禁，最低 macOS 版本仍需真实环境验收，见 [macOS 兼容性门禁](../architecture/node-distribution-proposal.md#macos-兼容性门禁)。

`check:node` 同时覆盖原有自包含包和新的无二进制主包／平台包。后者用 Node 随附 npm 离线安装本地 tarball，override 仅存在于临时消费端；仓库依赖管理继续使用 pnpm。正常 runner 从已安装包检查声明，musl 在对应 CPU 的 Alpine 运行同一消费端夹具、在构建机检查声明。

`check:node:registry -- <完整交付目录>` 让 npm／pnpm 从仅监听本机的只读注册表冻结安装全部目标依赖，无 overrides 或架构覆盖。CI 在八种实际运行环境消费同一批已汇总 tarball；本地回归仅验证本机真实二进制与其他平台的筛选。冷缓存、失败路径及 Alpine 测试客户端启动方式见[隔离注册表安装验收](../architecture/node-distribution-proposal.md#隔离注册表安装验收)。它不执行公共 npm 发布。

`check:node:windows -- <完整交付目录> <新的结果目录>` 要求 Windows x64 Docker，使用固定 Server Core 镜像、Node ZIP 与同批 tarball。日常门禁分别运行 `npm-clean`（无额外 CRT、无 pnpm）与 `pnpm-runtime`（安装经摘要和 Microsoft 签名校验的运行库后运行 pnpm），两组必须均通过，报告独立保存。前者拒绝额外 VC Runtime 和开发工具链，并核对实际加载模块。`--compare-vc-runtime` 保留原来的完整对照，仅供按需诊断；其失败仍返回非零，不属于日常门禁。结果不能替代 arm64／Windows 11 验收，详见 [Windows x64 容器验收](../architecture/node-distribution-proposal.md#windows-x64-干净容器验收)。

`build:node:native` 在任务内默认启用 x64 MSVC 静态 CRT，本地与 CI 共用；其他目标与独立 Cargo 命令不变。显式目标参数可用于动态诊断，但正式产物必须通过 `check:node:windows-crt` 的静态依赖检查。检查后的 DLL 不得重复构建；继续构建 TS、运行 Node 与类型合同，封存同一产物。手动 CI 参数 `compare_windows_crt` 才额外构建动态基线；日常只构建静态交付包。详见[静态 CRT 策略](../architecture/node-distribution-proposal.md#windows-x64-静态-crt)。

`check:node:windows-arm64 -- <完整交付目录>` 审计封存 ARM64 PE 的架构、导入表和摘要，记录 CRT 依赖但不套用 x64 静态策略。现有 arm64 注册表任务追加最低 Node 消费检查并保存证据；有预装运行库的 runner 不代表干净系统，详见 [Windows arm64 兼容性门禁](../architecture/node-distribution-proposal.md#windows-arm64-兼容性门禁)。

### 依赖版本管理

根 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) 的默认 Catalog 是直接 npm 开发依赖版本的唯一来源，各 manifest 使用 `catalog:`；`catalogMode: strict` 约束后续依赖添加，CI 继续冻结安装。Rust 依赖与 mise 工具链版本不进入 Catalog。

### 类型检查与失败处理

Rslib 负责 JS 与声明输出；`tsconfig.json` 保留严格类型规则并设置 `noEmit`，独立 `tsc` 不再生成产品文件。声明生成启用 `abortOnError`，类型错误必须让构建退出非零；失败构建的任何残留文件都不可作为成功产物。`check:node:types` 继续使用 tsc 检查正负类型合同，Rslib 不代替该独立检查。

`tools/tests/build.test.ts` 先确认有效源码可构建，再验证未引用源码的类型错误会阻止构建。输出布局、ESM／require 加载、声明与原生绑定由 `packages/ziwei/test/package.test.ts` 在真实 tarball 的独立消费端统一验证；Node 基准源码指纹包含 Rslib 配置。

## Node 测试框架

Node 侧统一使用锁定版本的 `@rstest/core`（JavaScript 框架，不是 Rust 的 rstest crate），由根 [rstest.config.ts](../../rstest.config.ts) 聚合三个互不重叠的项目。配置不导入产品源码；`node:assert/strict` 断言保持不变。

| 项目 | 范围 | 根目录命令 |
| --- | --- | --- |
| `ziwei` | 包 API、原生边界、Worker、GC 与独立打包消费端 | `mise run check:node`：先构建，再运行测试与 TypeScript 合同 |
| `node-tools` | 开发命令、运行时选择、参数、退出码与 Rslib 构建合同 | `mise run check:node:tools` |
| `node-bench` | 基准记录器与 CLI 合同；只有 smoke，不设性能门禁 | `mise run check:node:bench` |

### 选择测试

已经构建时，可用 `mise run test:node -- -t palace` 筛选测试，或 `mise run test:node -- --watch` 持续运行；复杂参数使用上文直接 CLI 入口。`mise exec -- pnpm exec -- node node_modules/@rstest/core/bin/rstest.js list --filesOnly` 核验三个项目的发现范围，TypeScript 负例仍由独立 `tsc` 任务编译，不作为运行时测试。

### 隔离与串行执行

基准工具会重新构建同一份 `dist`，常规验证应按上述分组命令串行执行，不要同时运行 `ziwei` 消费端测试与 `node-bench` 构建冒烟。

测试使用独立 Node 子进程池。`ziwei` 的包入口与内部 native seam 显式交给 Node 加载，保留 ESM/CJS 单例身份与真实 `.node` 加载；关闭 Rspack 对 Worker 的打包改写，Worker 从原始夹具路径运行。配置仅用于测试，不进入 npm 分发包。安装与迁移依据 [Rstest 官方指引](https://rstest.rs/guide/start/agent-install.md)，字段以项目安装版本的类型和 CLI 为准。

## 按变更选择验证

| 变更 | 验证范围 |
| --- | --- |
| 核心 Rust 行为或公开 API | 受影响的行为测试、格式、Clippy；按影响核对 release、特性组合、Rustdoc、MSRV 和消费端检查 |
| README 或架构文档中的 Rust 示例 | CI 定义的 Markdown 示例编译与文档测试 |
| 开发工具 | 对应工具的格式、Clippy 和快速测试；命令行、进程调用或输出合同变化时补对应端到端检查 |
| Cargo、工具链、依赖或打包配置 | 受影响的 MSRV、特性组合、打包及独立消费端检查 |
| CI 或 Git 钩子 | 配置语法、触发条件、命令与失败传播；本地运行可执行的相关检查，远端结果按实际状态报告 |
| 纯文字或指引 | 检查差异、空白、相对链接和指令一致性 |

测试命令的覆盖范围以对应 Cargo workspace 为准；修改独立工具时，核对其 manifest 和任务，确保检查实际包含该工具。基准负载、校准和性能证据遵循 [基准规范](../engineering/benchmarks.md)。

验证覆盖本次行为与项目必需检查。相关检查通过后，仅因新改动、失败或未解决疑点扩大或重复验证；发现既有失败时，区分其与本次改动的关系，并按 [完成标准](../../AGENTS.md#完成标准) 报告。
