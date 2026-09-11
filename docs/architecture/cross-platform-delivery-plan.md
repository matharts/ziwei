# 跨平台完整交付计划

状态：2026-09-12，`f38b0ea` 已验证 Wasm 工具安装修复；新增仿真的目录隔离修复 `87c5e66` 已让 s390x 完成双 Node／双客户端消费。ppc64le 的 npm 通过、pnpm 启动仍崩溃，候选总体验收未通过。其余七个原生候选平台、Wasm 与浏览器适配均属于完整交付目标。本文区分实现与实测状态，提交、推送和发布仍以用户授权为准。

## 范围与当前基线

- 既有八个原生目标的分发、最低 Node 消费测试与同批产物验收已经完成，证据固定于[首批兼容性验收总览](node-distribution-proposal.md#首批兼容性验收总览)。保留这些检查，不以新平台实验替换现有门禁。
- 完整原生目标范围为十五项；未验收的七项继续使用“候选”表示验证状态，不表示可以从完整目标中删除。
- Wasm 绑定与浏览器适配是两个相关工作包：前者承担 Rust／JavaScript 转换，后者承担加载、资源定位与浏览器消费合同；两者不能用“生成了 `.wasm`”合并宣称完成。
- 本轮不新增命理规则、流月／流日／流时、连续飞化、历法换算或解释能力。宿主扩展复用现有核心能力。
- 先完成完整交付设计与实施，再按确认范围推进发布；当前所有包继续禁止发布。

## 并行工作与文件责任

| 工作线 | 独立交付物 | 可并行部分 | 必须等待的条件 |
| --- | --- | --- | --- |
| 七个原生候选目标 | [原生平台矩阵](../engineering/native-candidate-platforms.md)、候选 CI 与审计器 | 目标检查、交叉构建配置、运行时及环境核验 | 每项的真实宿主环境与消费合同；不能只凭 CLI 识别目标增加支持声明 |
| Wasm Adapter | `bindings/wasm`、[适配设计](wasm-adapter-design.md) | Rust 输入、结果、错误与生命周期实现 | 匹配版本的生成胶水与真实 Wasm 测试 |
| 浏览器 Adapter | `packages/ziwei-wasm`、[浏览器合同](browser-adapter-design.md) | 门面、加载、CSP、Worker 与消费端测试 | 当前 Wasm 产物、三引擎及独立安装包的实际验收 |
| 集成与交付 | 本文及既有分发设计 | 整合状态、依赖与公共验收条件 | 各分项通过后才能汇总产物；正式发布另需权限、流程和授权 |

各 Adapter 分别修改自己的 Rust／TS 目录与测试；根 manifest、锁文件、mise 和主 CI 由集成工作线统一调整。候选平台使用独立 workflow，不改既有八目标分发 manifest。没有真实消费需求前，不创建占位包或通用转发层。

## 推荐的宿主分工

用户尚不确定 Android／OpenHarmony 应采用哪一种宿主方式。建议按实际应用场景交付，而不是把十五个 Rust 原生目标一律解释成十五个常规 Node 包；以下为待确认方案，不修改既有 Node 合同。

| 调用场景 | 推荐路线 | 不应混淆的结论 |
| --- | --- | --- |
| 真正的 Node.js 应用 | 保留 `@matharts/ziwei` 与 Node-API 产物；扩展具备合规 Node 运行时的目标 | 需要逐目标核验运行时和包管理器，不从 target 名称推导可运行 |
| 网页、移动浏览器与 WebView | 独立 `wasm-bindgen` 单线程 Adapter；已实施私有包 `@matharts/ziwei-wasm` | 各浏览器／WebView 仍须实测；Wasm 不替代 Android／OpenHarmony 原生目标 |
| Android 系统应用 | 优先研究 JNI／Kotlin 薄适配，复用 Rust 核心 | 属于新的宿主 Interface 和交付形式，需确认后实施；不以维护非官方 Node 移植为默认前提 |
| OpenHarmony 系统应用 | 优先研究 Native API／ArkTS 薄适配，复用 Rust 核心 | 官方 NAPI 基于 Node.js N-API，但宿主加载器不同；不能推定现有 napi8 addon 或 npm 门面直接兼容 |

Android 的 Node 支持限制、OpenHarmony 宿主差异和原生替代路线的官方依据见[原生平台矩阵](../engineering/native-candidate-platforms.md)。若调用方确实需要移动系统中的 Node.js 应用，应另行锁定具体 Node 移植及其维护、安装与验收合同，而不是静默降低 Node 门槛。

Wasm 与浏览器按推荐方案实施：独立 `bindings/wasm` 与 `@matharts/ziwei-wasm`；显式 `initialize` 返回就绪后的 `Ziwei` 与身份对象，再执行同步建盘和查询。Wasm-only `dispose()` 管理命盘，默认不引入线程池、共享内存或隐藏回退；现有 Node API 不变。

另一个共享前置条件是测试客户端：同步上游后使用 pnpm 12.4.1，官方已提供 Linux ppc64、s390x、FreeBSD x64、Android arm64 客户端包；旧版 12.3.4 的“七项均无对应包”结论不能继续用于当前版本。四项已有包仍需真实启动和消费验收，GNU armv7、Android armv7 与 OHOS 仍未列出对应包，见[逐目标客户端矩阵](../engineering/native-candidate-platforms.md#pnpm-客户端包存在与运行通过分开记录)。不因元数据变化调整 Node 门槛、移动宿主选择或平台支持声明；宿主专用 SDK 使用自己的安装与消费合同。npm 冒烟通过不能代替完整包管理器合同，也不能通过跳过 pnpm 测试把目标标为已验收。

## 原生目标状态

下表是完整目标清单，不是支持矩阵。候选目标的具体工具链和环境证据以[原生平台矩阵](../engineering/native-candidate-platforms.md)为准。

| 目标 | 本轮起点 | 推进条件 |
| --- | --- | --- |
| `aarch64-apple-darwin` | 已验收 | 保留现有构建、分发与最低 Node 检查 |
| `x86_64-apple-darwin` | 已验收 | 同上 |
| `x86_64-pc-windows-msvc` | 已验收 | 保留静态 CRT 与两组干净容器检查；不外推最低 Windows |
| `aarch64-pc-windows-msvc` | 已验收当前 runner | 另需落实无预装开发工具／运行库的环境验收 |
| `x86_64-unknown-linux-gnu` | 已验收 | 保留 glibc 2.28 用户态与最低 Node 检查 |
| `aarch64-unknown-linux-gnu` | 已验收 | 同上 |
| `x86_64-unknown-linux-musl` | 已验收 | 保留当前 Node 与最低 Node 的同架构容器检查 |
| `aarch64-unknown-linux-musl` | 已验收 | 同上，不提高 Node 的平台支持分级 |
| `armv7-unknown-linux-gnueabihf` | 候选，必须推进 | 锁定合规 Node 制品和真实 armv7 运行环境 |
| `powerpc64le-unknown-linux-gnu` | 候选，必须推进 | 锁定 ppc64le 工具链、字节序与实际运行环境 |
| `s390x-unknown-linux-gnu` | 候选，必须推进 | 核对大端与实际运行环境，不照搬现有小端产物检查 |
| `x86_64-unknown-freebsd` | 候选，必须推进 | 锁定 FreeBSD 用户态、Node 及 VM／原生测试环境 |
| `aarch64-unknown-linux-ohos` | 候选，必须推进 | 先明确 Node.js 应用或系统应用内嵌宿主，再确定 Interface |
| `aarch64-linux-android` | 候选，必须推进 | 同上，不默认将 Android 原生产物视作常规 Node 平台包 |
| `armv7-linux-androideabi` | 候选，必须推进 | 同上，并单独验证 32 位表示与 CPU 要求 |

Wasm 与浏览器不计入十五个原生 target 的数量，也不自动作为原生模块加载失败时的回退路径。

## 共用的不变量

沿用 [Rust 包架构](rust-package-design.md)与 [Node Interface](node-api-design.md)的已确认部分：

1. `crates/ziwei` 是唯一的排盘实现。宿主 Adapter 不复制规则表、不重算或修正核心结果，不从 Rust 私有布局推导协议。
2. Rust Adapter 位于 `bindings/`，TypeScript 分发代码位于 `packages/`；Node 与 Wasm Adapter 单向依赖核心，彼此不依赖。
3. 现有 Node 同步入口、包根导出、数字表示、错误分类、缺失值、冻结与缓存合同不因浏览器扩展而改变。
4. 新宿主按已有输入、固定命例和查询边界验证逻辑结果一致；生命周期、初始化、线程及宿主错误需要明确自己的 Interface，不能假定与 Node 相同。
5. 无安装脚本下载二进制、隐式源码构建或默认 Wasm 回退。改变这些行为需要单独确认。
6. 实际公开支持只包含通过构建、独立包消费和目标环境运行验收的组合；一手资料、编译结果、模拟测试与实机结果分别记录。

## 实施顺序与依赖

1. **锁定新宿主合同**：确认 Android／OpenHarmony 的使用方式，确认 Wasm 路线、浏览器入口、初始化和生命周期；候选包名不先写入正式 manifest。
2. **并行完成首个可运行切片**：原生工作线逐目标取得可复现构建与运行路径；Wasm 工作线打通一种输入、一个查询和一个错误；浏览器工作线搭建真实页面、资源加载与 Worker 测试入口。浏览器协议设计可先行，真实产品验收等待 Wasm 产物。
3. **补齐完整 Interface**：复用核心全部现有能力，补齐两种输入、只读事实、定位、四化、大限／流年、错误与快照；分别覆盖 Node 和新宿主的生命周期合同。
4. **集成构建与消费验收**：加入 mise、冻结依赖、独立打包和对应 CI；逐目标验证实际安装和失败路径，Wasm／浏览器验证打包后的公开入口。现有八目标持续回归。
5. **完整交付与发布准备**：根据已确认的宿主包结构封存和关联产物，核对版本及来源，完成文档和剩余环境检查。随后设计认证、审批、部分失败恢复及公共注册表验收，未授权前不发布。

不能让“十五目标全部纳入目标范围”变成“未验证的包先进入 optionalDependencies”。各目标实施可以并行，支持声明与正式交付必须等相应验收完成。

## 完成标准

- 七个新增原生目标逐项有可复现构建、实际宿主、版本／CPU／系统观察、独立包消费与失败路径证据；无法满足原 Node 合同的目标必须先确认宿主合同，不能标成完成。
- Wasm 产物与核心结果一致，初始化失败和生命周期错误可控；所有已确认的查询和类型合同都有测试。
- 浏览器从真实打包产物加载，验证主线程与 Worker、资源路径、跨源和 CSP；测试引擎与实际品牌浏览器的支持结论分别报告。
- Node 原有公开 Interface 和八目标门禁无回归；共享配置没有因并行修改遗漏目标或混入未验证产物。
- 分项通过后才记录为“已验收”；本轮研究文档完成不代表上述实现或运行检查已完成。

## 本轮执行边界

本轮已新增独立 Wasm Rust／TS 实现、构建任务和浏览器测试，并为七候选添加核心目标检查、三 GNU 候选交叉构建与静态审计配置。支持列表仍保留已验收八目标。真实远端 CPU、Android／OpenHarmony 原生消费与公共发布不能由本机检查替代。

以下保留设计阶段的历史估算，不是剩余工时或实际耗时。工作量按独立责任估算，不把 Agent 的运行时间当成产品实施工时，也不能将人日直接除以并发数量。

| 工作包 | 设计阶段粗估 | 范围与不确定性 |
| --- | --- | --- |
| Wasm Rust 绑定、传输与生命周期 | 4.5–7.5 人日 | 不包含浏览器资源打包、三引擎或原生平台；确认 Interface 后实施 |
| 浏览器门面、资源交付、Worker 与三引擎 | 5.5–10 人日 | 不重复计入 Wasm Rust 转换；正式产品验收依赖 Wasm 产物 |
| 七个原生目标 | 16.5–31 人日，见[逐目标估算](../engineering/native-candidate-platforms.md) | 按四个 Node 目标、Android JNI／Kotlin 与 OHOS Native API 的推荐方案估算；不含未知 pnpm 移植与环境等待 |
| 完整发布工程 | 交付形式确认后重新估算 | 十五原生目标可能包含不同宿主 SDK，不能直接沿用八平台 npm 首发估算 |

Wasm 与浏览器两部分合计约 10–17.5 人日；加上上述推荐宿主方案的七原生目标，已识别的实施工作约 26.5–48.5 人日。它不是总项目的固定报价或日历工期：未知 pnpm 移植、环境与设备获取、依赖兼容问题、用户决策等待和发布工程均另计。若坚持三个移动目标继续采用非官方 Node 宿主，原生部分必须重新估算。此前 3–5 人日仅覆盖八平台首发工程，不能用于完整交付。

首轮设计资料经一手来源核对。实施阶段安装了项目 Rust 的 Wasm 标准库、mise 管理的精确 wasm-bindgen CLI 和测试专用三引擎；未申请外部机器、访问设备或安装移动 SDK。已有 Android NDK 与 OpenHarmony SDK 缺口见[原生平台矩阵](../engineering/native-candidate-platforms.md#已实现gnu-静态候选探针)。历史估算不等于实际耗时或验收通过。

## 本轮本地验证

本节保留首轮提交前的历史记录；当前远端结果见[当前远端结果与下一步](#当前远端结果与下一步)。

记录日期：2026-09-11。环境为 macOS 26.6.2（25G83）arm64、项目 Rust 1.98.1、Node 24.21.0；另核对 Rust MSRV 1.98.0 与 Node 最低版本 24.15.0。代码尚未提交，因此这些结果是当前工作树的本地证据，不是新提交的远端 CI 结果。

| 检查 | 本轮结果与边界 |
| --- | --- |
| Wasm 构建 | `build:wasm` 通过；生成工具与 crate 同为 wasm-bindgen 0.2.128，独立 ESM、声明与 Wasm 资源已生成 |
| 浏览器消费 | Chromium 153.0.8010.12、Firefox 155.0、WebKit 26.6 实际运行；三个引擎 × tarball／Vite／Rslib 共九种组合均验证两建盘入口，各对照 3,971 项查询及快照、冻结、缓存和释放合同 |
| 主线程与 Worker | 三引擎各在主线程、Dedicated Module Worker 验证两入口及同一组查询；Worker 执行 50,000 次建盘期间主线程 rAF 仍推进，快照跨线程后不保留冻结描述符 |
| 浏览器边界 | 三引擎分别验证 i32 年端点、相邻越界与非法数值、Worker 结构化错误后的同实例恢复，以及忙碌 Worker 的终止与替换；不据此声称资源回收具有确定性时限 |
| 真实内存扩容 | 测试层透明观察公开初始化实际产生的实例，不改产品或 Wasm bytes；三引擎中 `memory.grow(1)` 实际增加 65,536 字节且旧 buffer 失效后，存量命盘的 3,971 项查询、DTO、缓存及释放合同仍通过 |
| Rust 回归 | workspace 全 feature 的 debug／release 测试、workspace 与 Wasm target Clippy、格式检查通过；Rust 1.98.0 的 Wasm target 检查与绑定宿主测试通过 |
| 既有 Node 回归 | 重新构建后，Node 测试 46 项、工程工具测试 93 项通过；Node／工具类型检查通过 |
| 候选审计器 | 48 项聚焦测试分别在 Node 24.21.0 与 24.15.0 通过；这是解析器和候选入口验证，不是目标 addon 的运行证据 |
| 七目标核心检查 | 安装项目 Rust 1.98.1 对应的七份标准库后，逐项执行 `cargo check -p ziwei --lib --all-features --target <target> --locked --target-dir target/candidate-checks`，七项均 exit 0；目标为上述三个 GNU、FreeBSD、OHOS 和两个 Android 候选，不链接或运行 addon |
| 依赖与集成 | 冻结 pnpm 安装通过；现有八目标门禁保持不变，新增 Wasm 主 CI gate 与独立候选 CI；工作流 YAML 和 shell 片段本地检查通过 |
| 最终浏览器聚合 | `check:wasm` 构建／测试／类型检查通过；随后补入内存扩容测试，最终 `test:wasm` 为 7 文件、37 项通过，零失败、零跳过；两项目类型检查、全局 Oxlint 与 Oxfmt 通过 |

Wasm 原始资源为 **124345 bytes**，SHA-256 为 `6c5d9ffbe51015c5dbcdc67f9e08f9469b8842a3d6372ef558899c240b77ecbb`。这是本次构建记录，不是需要永久固定的资源大小或性能基线。生成产物未加入 Git，后续源码变化必须重新构建与验收。

上述完整查询对照使用固定的 1992 年八月十五卯时输入及对应的干支参数；3,971 是查询参数组合数，不是出生信息穷举数。九种消费组合均从真实 tarball 独立安装，不使用源码别名；Vite／Rslib 验证生产输出与嵌套部署路径，不能外推任意 CDN、框架或生产策略。

显式扩容、分配／释放循环与 GC 冒烟只验证对应行为，不构成内存上界、无泄漏证明或浏览器性能基线。测试没有新增公共调试入口；真实品牌浏览器、移动设备与最低版本仍须另行验收。

本轮可在当前环境完成的实现与检查已收口；完整跨平台交付仍未完成，不能把“已配置 CI”写成“远端通过”。三个 GNU addon 的实际交叉构建／审计、七目标的原生宿主消费、移动 SDK 设计与设备验收、最低及品牌浏览器范围仍未完成。所有包保持未发布；本轮未提交或推送代码。

2026-09-12 已复核上游同步后的候选 CI：CLI 3.9.1 的目标映射、交叉工具链包、YAML／shell 和失败传播检查未发现需要修改 workflow 的问题；48 项审计器回归通过。详细边界见[同步后验证记录](../engineering/native-candidate-platforms.md#2026-09-12上游同步后的复核)。这些是本机检查，不是远端构建结果。

## 当前远端结果与下一步

2026-09-12 核验提交 `f38b0ea2a84ee0c742a6c1dff4fd663af029399b` 的实际结果；这些结果不覆盖其后的未提交仿真实现：

| 工作流 | 结果与边界 |
| --- | --- |
| [候选 CI `34632827266`](https://github.com/matharts/ziwei/actions/runs/34632827266) | 11 个 job 全部通过：七目标核心类型检查、三项 GNU addon 交叉构建／静态审计及汇总 gate；没有候选宿主运行证据 |
| [主 CI `34632827267`](https://github.com/matharts/ziwei/actions/runs/34632827267) | 21 个 job 全部通过，包含 Wasm／浏览器 37 项测试；不外推品牌浏览器、WebView 或原生候选支持 |

此前 Wasm 失败源于 mise 2026.9.5 的嵌套内联任务在冷缓存下未安装子任务的 `tools`。修复改为在胶水调用处显式执行精确版本的 `mise exec cargo:wasm-bindgen-cli@0.2.128 -- wasm-bindgen`；独立回归覆盖冷缓存安装、暖缓存复用及安装／生成失败传播。修复后的主 CI 已完成真实 CLI 安装、胶水生成与浏览器消费。

用户已确认保持 Node 的 napi-rs 与浏览器的 wasm-bindgen 两条适配路径，不合并或迁移绑定。对照实验留在本地忽略目录，不进入分发包或本次提交；上述结果不改变平台支持声明。

后续 `d8a30aa` 首次执行[ppc64le／s390x 仿真消费](../engineering/native-candidate-platforms.md#ppc64les390x-仿真消费)，暴露封存测试前置条件和 pnpm 启动问题。修复提交 `87c5e66` 的[候选 CI](https://github.com/matharts/ziwei/actions/runs/34643638388) 已使 s390x 完整通过，但 ppc64le 仍失败；当前增加同环境的直接启动与系统调用诊断，不把旧失败重标为通过。具体证据见[复验记录](../engineering/native-candidate-platforms.md#2026-09-12目录隔离复验与-ppc64le-启动诊断)。仿真不代替原生及最低系统检查；Android／OHOS 的具体 SDK Interface 和真实环境尚未确定。公共发布仍未授权。
