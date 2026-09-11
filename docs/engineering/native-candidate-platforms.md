# 七个原生候选平台：宿主、构建与验收矩阵

状态：2026-09-12，提交 `d8a30aa` 已首次运行 ppc64le／s390x 的独立 QEMU 消费任务。七目标核心检查、三项 GNU addon 交叉构建／静态审计及两个架构、两版 Node 的 npm 消费通过；pnpm 启动失败，完整候选验收仍未通过。七目标仍属于用户要求的完整交付范围。现有八目标结论沿用 [Node 分发设计](../architecture/node-distribution-proposal.md)，不在本文重做。

候选实现包含 [静态审计](../../packages/ziwei/tools/compatibility.ts)、[候选封存与消费](../../packages/ziwei/tools/candidate.ts)、[仿真控制器](../../packages/ziwei/tools/candidate-runtime.ts) 和独立的[候选 CI](../../.github/workflows/native-candidates.yml)。不改正式目标 manifest、依赖或公开 API，不安装本机 SDK、虚拟机或设备工具，不申请云资源，不发布。下文的实施路径与工期是项目建议，不是上游支持承诺。

## 结论与推荐

**应按真实调用方划分交付物，不把七个 Rust triple 都等同于七个 Node npm 平台。**

- Linux armv7、ppc64le、s390x 和 FreeBSD x64：继续以现有 Node API 为目标，先解决运行时与测试客户端。
- Android arm64／armv7：若服务 Android 原生应用，推荐另行设计 JNI／Kotlin 薄适配及 AAR；若服务移动网页或 WebView，则使用独立 Wasm 适配。两者不是同一项交付。
- OpenHarmony arm64：若服务原生应用，推荐 Native API／ArkTS 薄适配；先验证 SDK、模块注册与实际调用，再确定 HAR 等分发形式。不能直接把 Node npm 包当作 ArkTS 库。
- 不建议为了排盘库维护一份非官方 Node 移植：它把 JavaScript 引擎、系统补丁、包管理器和生命周期维护引入核心目标之外。只有调用方明确运行 Termux 或特定 Node 移植时，才为该宿主增加独立合同。

Android 官方将 JNI 定位为 Java／Kotlin 与原生代码之间的接口；OpenHarmony 官方描述的是基于 Node-API 的 ArkTS／JS 原生模块系统，而不是完整 Node.js 运行时。这些事实支持上述建议，但不自动确定本项目的 API 或包名。[Android JNI](https://developer.android.com/training/articles/perf-jni)、[OpenHarmony Node-API](https://github.com/openharmony/docs/blob/master/en/application-dev/napi/napi-introduction.md)

**Wasm 在移动端通过，不能代替 Android 两个 ABI 或 OpenHarmony 原生产物的验收。** 推荐的宿主拆分仍需形成项目决策；本轮不擅自把既有三个 npm 候选改成新绑定、删除候选或降低 Node 门槛。

## 当前约束与证据

2026-09-12 配置核对：开发 Rust 1.98.1、MSRV 1.98.0、开发 Node 24.21.0、最低 Node 24.15.0、pnpm 12.4.1、napi CLI 3.9.1；Rust 绑定为 napi 3.12.3、napi-derive 3.6.4、napi-build 2.4.2，仅启用 `napi8`。依据为 [mise](../../mise.toml)、[Catalog](../../pnpm-workspace.yaml)、[绑定 manifest](../../bindings/node/Cargo.toml) 与 [Node 包约定](../../packages/ziwei/AGENTS.md)。下方历史验证记录保留执行时的版本，不作为当前依赖清单。

| 事实 | 对本项目的影响 | 一手证据 |
| --- | --- | --- |
| Node 两个固定版本均把 ppc64le／s390x 列为 Tier 2，armv7／FreeBSD 列为 Experimental；Android 明确不支持 | 项目实测不能改写上游支持等级 | [24.15.0](https://github.com/nodejs/node/blob/v24.15.0/BUILDING.md#platform-list)、[24.21.0](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#platform-list) |
| 两个版本的官方 SHA 清单均有 Linux ppc64le／s390x，没有本次其余五个目标的二进制 | 后五目标需另行验证运行时来源，不能只替换官方下载 URL | [最低版本清单](https://nodejs.org/dist/v24.15.0/SHASUMS256.txt)、[开发版本清单](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt) |
| napi CLI 接受七个 triple，不代表对应运行时、SDK 或完整测试路径已存在 | 生成包名与成功交叉编译都不足以宣称支持 | [napi-rs 兼容性](https://napi.rs/docs/more/support-compatibility) |
| `pnpm` 12.4.1 的平台依赖已包含 Linux ppc64、s390x、FreeBSD x64 与 Android arm64 客户端 | 四项目标应从“缺客户端包”改为“客户端包存在、目标运行待验”；不能把另外三个目标的缺口泛化到全部七项 | [当前 pnpm 元数据](https://registry.npmjs.org/pnpm/12.4.1)、[当前 exe 元数据](https://registry.npmjs.org/@pnpm/exe/12.4.1) |
| GitHub 托管 runner 没有本次七目标的直接原生标签；自托管 runner CPU 支持也不包含 ppc64le／s390x | 后两者需由受支持的控制机远程执行，或使用相应原生 CI 服务；不能只添加 `runs-on` | [托管 runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[自托管架构](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#supported-processor-architectures) |

Rust 1.98.0 文档将前五项列为 Tier 2 with Host Tools，两个 Android 目标列为 Tier 2 without Host Tools；这描述 Rust 工具链，不描述 Node 支持。下表的指针宽度、字节序、OS／env 经本机 Rust 1.98.1 的 `rustc --print cfg --target <triple>` 核验；本机完成七目标核心 `cargo check`，远端另完成三项 GNU addon 的交叉链接与静态审计，均未执行候选宿主代码。[Rust 1.98.0 平台表](https://doc.rust-lang.org/1.98.0/rustc/platform-support.html)

## 平台矩阵

| 目标 | CPU／ABI／libc | 预期宿主与主要缺口 | 优先路径 |
| --- | --- | --- | --- |
| `armv7-unknown-linux-gnueabihf` | 32 位 ARMv7-A，小端，hard-float，glibc | Node `linux/arm`；没有两个固定版本的官方二进制，缺真实 ARMv7 环境及 pnpm 客户端 | 官方源码固定版本试构建 Node；交叉编译 addon，ARMv7 真机验收 |
| `powerpc64le-unknown-linux-gnu` | 64 位 POWER，小端，glibc | Node `linux/ppc64`；至少 POWER8，缺原生机器；pnpm 包已有，尚未启动或消费验收 | Linux x64／arm64 交叉构建；POWER 原生远程验收 |
| `s390x-unknown-linux-gnu` | 64 位 s390x，大端，glibc | Node `linux/s390x`；缺 IBM Z/LinuxONE 环境；pnpm 包已有，尚未启动或消费验收 | 同上；额外执行大小端敏感的静态检查与完整公开合同 |
| `x86_64-unknown-freebsd` | 64 位 x86，小端，FreeBSD libc | Node `freebsd/x64`；缺固定版本 Node 和 VM 验收；pnpm 包已有，尚未实测 | 固定 FreeBSD VM 内构建／运行，宿主控制交付证据 |
| `aarch64-unknown-linux-ohos` | 64 位 ARM，小端，OHOS sysroot／musl 系 ABI | Rust 的 `target_os=linux` 不意味着普通 Linux Node；ArkTS Native API 与 Node npm 合同有差异 | 推荐 OpenHarmony 原生适配；先确认实际产品宿主，不套用 glibc／Alpine 产物 |
| `aarch64-linux-android` | 64 位 ARM，小端，`arm64-v8a`，Bionic | 普通 APK 不具备 Node npm 宿主；Termux 是特定移植环境 | 推荐 JNI／Kotlin；WebView 另走 Wasm |
| `armv7-linux-androideabi` | 32 位 ARM，小端，`armeabi-v7a`，Bionic／Android 调用约定 | 不同于 GNU hard-float target；另需可执行 32 位 ARM 的设备 | 与 Android arm64 共用原生适配，单独编译和实机验收 |

Node `arch` 中的 `ppc64` 不包含字节序，必须额外核验 little-endian；s390x 则必须核验 big-endian。Android ABI 不能仅用“都是 ARM”互换。[Android ABI](https://developer.android.com/ndk/guides/abis)

### pnpm 客户端：包存在与运行通过分开记录

以下核验官方注册表的固定版本元数据、发布包装器源码及当前锁文件，不代表客户端能在目标系统启动。“未列出”限定为 `pnpm`／`@pnpm/exe` 的平台依赖和入口选择项，不表示整个注册表中任意名称的包都不存在。`os`／`cpu`／`libc` 是包的筛选字段，不提供最低系统、CPU 指令集或动态库保证；未声明 `libc` 也不表示没有 libc 依赖。

| Rust 目标 | pnpm 12.4.1 对应客户端 | 包声明的 `os`／`cpu`／`libc` | 仍需完成 |
| --- | --- | --- | --- |
| `armv7-unknown-linux-gnueabihf` | 未列出对应包 | — | 确定客户端路径；不能把 arm64 客户端当成 32 位 ARM 客户端 |
| `powerpc64le-unknown-linux-gnu` | [exe.linux-ppc64](https://registry.npmjs.org/@pnpm/exe.linux-ppc64/12.4.1) | `linux`／`ppc64`／`glibc` | 原生环境启动、字节序与依赖核验、完整消费合同 |
| `s390x-unknown-linux-gnu` | [exe.linux-s390x](https://registry.npmjs.org/@pnpm/exe.linux-s390x/12.4.1) | `linux`／`s390x`／`glibc` | 原生环境启动、大端检查与完整消费合同 |
| `x86_64-unknown-freebsd` | [exe.freebsd-x64](https://registry.npmjs.org/@pnpm/exe.freebsd-x64/12.4.1) | `freebsd`／`x64`／未声明 | 固定 FreeBSD VM 内启动、依赖核验与完整消费合同 |
| `aarch64-unknown-linux-ohos` | 未列出对应包 | — | 先确认宿主；普通 Linux arm64 musl 包不等于 OHOS 客户端 |
| `aarch64-linux-android` | [exe.android-arm64](https://registry.npmjs.org/@pnpm/exe.android-arm64/12.4.1) | `android`／`arm64`／未声明 | 若选择 Node 宿主，核验具体移植环境和客户端；包存在不提供 APK 原生接口 |
| `armv7-linux-androideabi` | 未列出对应包 | — | 若选择 Node 宿主，另行解决 32 位 Android 客户端 |

历史结论仅适用于当时固定的 12.3.4：[pnpm](https://registry.npmjs.org/pnpm/12.3.4) 与 [exe](https://registry.npmjs.org/@pnpm/exe/12.3.4) 的平台依赖只有八项；当前 12.4.1 列出十四项，其中四项对应本次候选。两版对照不能确定各目标首次加入的版本。

[pnpm 12.4.1 发布归档](https://registry.npmjs.org/pnpm/-/pnpm-12.4.1.tgz)的 `native-binary.mjs` 还显式拒绝非小端的 `ppc64`；`bin/pnpm.mjs` 查找或下载原生文件，再通过 `spawnSync` 执行。本次未发现无需原生客户端的纯 JS 包管理器兜底，不能用 JS 安装／转发入口宣称缺口已解除。本项目不为缺口降级 pnpm、不删除消费场景，也不新增未验收的平台依赖。

## 各目标实施与独立验收

### Linux armv7 glibc

- **构建**：锁定版本 CLI 的 GNU 路径包含 armv7，可在 Linux x64／arm64 使用 `--use-napi-cross`；实际 glibc 符号、ELF32、ARM EABI 与 hard-float 属性必须从产物读取。[CLI 3.9.1 源码](https://github.com/napi-rs/napi-rs/blob/7e3f293e2d6a3032eabfe51ff38bcaa82d342a2f/cli/src/api/build.ts)、[交叉构建](https://napi.rs/docs/cross-build)
- **运行时**：先试编译官方 24.15.0／24.21.0 源码并记录补丁与摘要；不能假设 unofficial-builds 必有对应版本，更不能退回 Node 22。上游门槛为 kernel 4.18、glibc 2.28，仍需当前受维护发行版与实际符号检查。
- **环境**：申请或复用获授权的 ARMv7-A Linux 真机；确认不是仅报告 ARM 名称的仿真。ARM64 主机能否执行 AArch32 取决于硬件与内核，不能仅凭 `--platform linux/arm/v7` 判定。
- **独立验收**：两个固定 Node 进程确为 32 位 ARM；同批 tarball 正常安装、失败分支、双建盘入口、错误、缓存、冻结、Worker 与声明合同通过。pnpm 缺口解决前，仅 npm 通过不算完整验收。
- **并行／依赖**：addon 交叉构建可与 Node 源码试构建并行；最终验收依赖真机、可复现 Node 和客户端策略。

### Linux ppc64le glibc

- **构建**：固定 CLI 的 `--use-napi-cross` 支持 ppc64le；复用现有 GNU 构建思路，但工具链存在不等于已经编译成功。审计 ELF64、PPC64、小端、glibc 需求及 CPU 基线，避免构建机 `native` 指令集泄漏。
- **运行时**：两个固定版本有官方 Node tarball，实施时验证对应官方 SHA；实际 `arch=ppc64` 加字节序与 POWER CPU 检测。Node 的 POWER8 下限不等于在较新机器测试后已经验证 POWER8。
- **环境**：可申请 OSU OSL 的 POWER9／POWER10 LE OpenStack 或 POWER CI；这是公开申请路径，不表示本项目已经获配，不能拿共享机器做权威性能基线。[OSU POWER 服务](https://osuosl.org/services/powerdev/)
- **独立验收**：受支持控制机经受限远程任务传入同批包、回收结构化结果；原生机器运行两个固定 Node 和公开合同，验证主包自动选择 `linux-ppc64-gnu`。验证已有 pnpm 客户端在最低 glibc 环境中的启动和安装行为，不预先假定其依赖与 addon 相同。
- **并行／依赖**：可与 s390x 共用交叉构建和 ELF 审计设计；机器申请独立推进，机器访问凭据不得交给不可信 PR。

### Linux s390x glibc

- **构建**：固定 CLI 同样包含 s390x GNU 路径；Rust 目标为大端。审计器若假设小端，应先按 ELF 数据编码分支处理，不能把审计失败直接归咎于二进制。
- **运行时**：使用两个固定版本的官方 Node s390x tarball；读取实际 Node、CPU、字节序、libc，而非由目标名推断。
- **环境**：已有获授权 IBM Z/LinuxONE Linux 主机优先；LinuxONE Community Cloud 有公开申请指引，但配额、有效期和准入需重新确认。本轮未申请，也不保证免费资源能覆盖长期 CI。[LinuxONE 申请指引](https://github.com/linuxone-community-cloud/technical-resources/blob/master/faststart/deploy-virtual-server.md)
- **独立验收**：同批 `linux-s390x-gnu` 包在原生 s390x 安装和加载；跑完整领域事实与错误合同，覆盖二进制元数据读取、数字与数组转换。QEMU 成功只能记为仿真证据，不替代本项目拟采用的原生验收。
- **并行／依赖**：与 ppc64le 并行申请环境和构建；大端检查独立，客户端启动与远程可信执行的验证流程可共享，但客户端二进制不能跨 CPU 复用。

### FreeBSD x64

- **构建**：首选固定摘要／版本的 FreeBSD x64 VM 原生构建；napi-rs 文档给出 FreeBSD VM 参考路径，也提供 Linux＋Zig 交叉替代。模板只构建上传，不代表已经运行测试。[FreeBSD 构建说明](https://napi.rs/docs/cross-build#freebsd)
- **运行时**：从受维护 FreeBSD 的软件源或官方 Node 源码取得两个固定版本，记录 ports 补丁与动态库；滚动 `pkg install node` 不能证明精确版本。Node 表中的 FreeBSD 13.2 下限也不授权在 EOL 系统上承诺支持。
- **环境**：FreeBSD 提供 VM 镜像；GitHub Linux 控制机可用经过审计并锁定提交的 VM action 运行 FreeBSD guest。此为真实 FreeBSD 用户态／内核，不是 Linux 容器；最低 FreeBSD 版本仍须独立验收。[官方镜像](https://www.freebsd.org/where/)、[VM action](https://github.com/cross-platform-actions/action)
- **独立验收**：实际 `freebsd/x64`，同批 `freebsd-x64` 包在无 Rust／编译器的消费 VM 内运行 ESM、require(ESM)、公开合同及 Worker；记录 libc、动态库与包管理器来源。
- **并行／依赖**：VM 配方可独立推进；精确 Node 构建与已有 pnpm 客户端的实际运行是前置条件，不依赖 Android／OHOS 决策。

### Android arm64 与 armv7

- **已知构建路径**：Rust 提供两个目标的标准库；固定 napi CLI 使用 `ANDROID_NDK_LATEST_HOME`，Android linker 名称选择 API 24。这只是当前 Node addon 路径，不是最终 APK 的 minSdk 承诺。[Rust Android](https://doc.rust-lang.org/1.98.0/rustc/platform-support/android.html)、[CLI 3.9.1 源码](https://github.com/napi-rs/napi-rs/blob/7e3f293e2d6a3032eabfe51ff38bcaa82d342a2f/cli/src/api/build.ts)
- **Node 路径缺口**：上游明确 Android 不受支持；Termux 的 Node 是带自身补丁的包，当前 `nodejs-lts` 配方为 24.18.0，既不是两个固定测试版本，也不能代表普通 Android 应用；该快照随上游变化。[Node Android](https://github.com/nodejs/node/blob/v24.15.0/BUILDING.md#android)、[Termux 配方](https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh)
- **推荐原生路径**：把输入、错误与结果合同映射到 Kotlin，Rust 核心仍只负责领域运算；JNI 负责对象生命周期、线程与异常。AAR 内按 `arm64-v8a`／`armeabi-v7a` 放置两个真正编译的库，不嵌入 Node 来复用 TypeScript 门面。
- **环境**：Android SDK／NDK、Gradle 构建机和两个 ABI 的原生设备；ARM64 设备不保证支持 32 位应用。模拟器可做早期回归，但 x86 模拟器或 ARM 转译不算相应 ARM 原生证据。
- **独立验收**：两个 ABI 分别安装最小 APK、核验实际进程位宽并加载 AAR；双建盘入口、领域查询、错误与并发调用一致，覆盖对象释放／GC。只有选择 Termux 专用 Node 合同时，才使用其 npm／pnpm 和 ESM 合同；两条路线不得混报。
- **并行／依赖**：两 ABI 共用 JNI/Kotlin 设计与大部分测试，设备验收独立；原生绑定设计属于待确认的宿主调整，本轮不创建包。WebView Wasm 由另一工作流负责，不抵扣这两项。

### OpenHarmony arm64

- **已知构建路径**：Rust 使用 OHOS SDK 与 sysroot；固定 napi CLI 接受 `OHOS_SDK_PATH`／`OHOS_SDK_NATIVE`，缺 SDK 时不能把生成 target 信息当作构建成功。[Rust OHOS](https://doc.rust-lang.org/1.98.0/rustc/platform-support/openharmony.html)
- **宿主差异**：OpenHarmony 的 NativeEngine／ModuleManager 负责 ArkTS／JS 原生模块；支持 Node-API 名称不代表具有 Node 24 的 `process`、`node:module`、npm、Worker 或 require(ESM) 行为。[官方 NAPI 实现](https://github.com/openharmony/arkui_napi#introduction)、[应用 Native API 用法](https://github.com/openharmony/docs/blob/master/en/application-dev/napi/napi-guidelines.md)
- **推荐原生路径**：面向 ArkTS 设计薄接口与声明，通过系统约定的 `.so` 注册和加载；是否复用 napi-rs 必须先逐项核验本绑定实际使用的 `napi8` 符号、类／错误／GC 合同。缺符号时调整宿主 adapter，不把业务逻辑搬出 Rust 核心。
- **环境**：确定 OpenHarmony 产品／API 级别、SDK、签名方式和 ARM64 设备，使用 HDC 在设备上部署最小应用。开发工具提供的 Node 进程通常在构建机，不能充当设备运行时证据。[官方 HDC](https://github.com/openharmony/developtools_hdc)
- **独立验收**：最小原生应用实际加载 arm64 库，ArkTS 调用创建／查询／错误与生命周期测试；记录 SDK、系统构建、设备 CPU 与库摘要。HarmonyOS 与 OpenHarmony 的支持声明必须分别核对，不能仅凭名称互换。
- **并行／依赖**：SDK 符号盘点可与 Android 设计并行；原生接口、打包与设备验收独立。若坚持特定 Node 移植，必须先证明其 Node 版本和完整 npm 合同，不能把 ArkTS 测试改名为 Node 测试。

## 共享实施顺序与完成标准

1. **合同与环境预检**：区分四个真正 Node 候选、两个 Android ABI、一个 OHOS 宿主；给出真实运行时和可获得环境。未获授权不申请服务或安装 SDK。
2. **客户端策略**：现有 Node 工程继续由 pnpm 12.4.1 管理；候选宿主不必安装整份 workspace。对已有客户端的四项先核验原生产物与实际启动，再执行消费合同；仅对确实缺少包的目标研究客户端路径，不把移植作为所有目标的默认前提。宿主专用 SDK 使用自己的安装合同；本轮不降 pin、不静默删 pnpm 场景。
3. **独立构建**：四条 Node 候选配方并行；Android 两 ABI 共用适配设计；OHOS 独立；Wasm／浏览器独立。Rust 领域核心和固定命例由所有适配共享，不复制排盘算法。
4. **消费与封存**：先做对应宿主真实加载，再封存精确产物；复用 commit／run／attempt、摘要与同批公共文件规则。远程机必须校验输入批次，控制机验证回传收据，失败不能仍生成成功完成标记。
5. **集成后再扩大声明**：Node 目标通过现有完整合同后才纳入主包平台依赖；新宿主按自身合同验收，不为凑足“十五个 Node 平台”伪造 `process.platform` 或发布占位包。

Node 候选的最低与开发 Node 测试均消费同一已封存 addon，不重新编译。正常／禁用 optional／缺失／损坏四类 npm 场景可先准备，但 pnpm 包未提供、启动失败或消费合同未验证都必须分别记为未完成。浏览器或原生 App 的合同不要求无意义地安装 npm，却也不能替代未完成的 Node 消费合同。

## 工作量与外部等待

以下为已有代码与合同基础上的工程粗估，不是排期承诺；以宿主决策已确认、工具链能工作和测试设备已可访问为前提。真实端口阻塞出现后需重估，不能把等待机器折算成固定工时。

| 工作包 | 初步工程量 | 等待或估算外事项 |
| --- | --- | --- |
| Linux armv7 Node／addon／消费配方 | 2–4 人日 | Node 固定版本源码能否成功、ARMv7 真机、pnpm 客户端 |
| Linux ppc64le 构建与远程验收 | 1.5–3 人日 | POWER 配额／授权、CPU 基线、已有 pnpm 客户端的运行验收 |
| Linux s390x 构建与远程验收 | 2–3 人日 | LinuxONE 账号／配额、大端问题、已有 pnpm 客户端的运行验收 |
| FreeBSD VM 与固定版本验收 | 2–4 人日 | Node ports／补丁与精确版本、已有 pnpm 客户端的运行验收 |
| Android JNI／Kotlin 双 ABI（推荐方案） | 4–7 人日，共用而非每 ABI 重复计算 | 新宿主合同、SDK／设备／签名；不包含 Node 移植维护 |
| OHOS Native API／ArkTS（推荐方案） | 3–6 人日 | SDK 符号差异、产品 API 级别、设备／签名 |
| 共享收据、跨宿主合同与集成文档 | 2–4 人日 | 待选客户端策略；未知 pnpm 移植工作不含在内 |

上述约 16.5–31 人日可分组并行，但不是 16.5–31 个自然日；也不包含 Wasm／浏览器、正式发布工程或设备采购。若选择维护非官方 Node 的移动端路线，这份 Android／OHOS 估算不适用，应先进行独立运行时可行性试验。

## 已实现：GNU 静态候选探针

独立入口为 `node packages/ziwei/tools/compatibility.ts --gnu-candidate <Rust-target> <addon.node>`，通过 mise 选择本项目 Node；接受本次三个 GNU 候选，拒绝其他 target、非普通文件和超过 16 MiB 的文件。输出 `verification: "static"`、原始文件字节数与 SHA-256、ELF 布局和 glibc 版本要求，不生成或接收 `batch.json`，也不尝试安装或加载 addon。

- 共享 ELF 检查支持 ELF32 ARM hard-float、ELF64 PPC64LE／S390 大端，以及现有 x64／arm64 GNU；核对 class、数据字节序、CPU、版本和 ELF header size。
- ARM 必须明确声明 EABI5 与 hard-float，拒绝缺失或矛盾的 soft-float 标记；PPC64LE 必须明确为 ELFv2。该检查不解码全部机器指令，不能证明 ARMv7 指令集或 POWER8 最低 CPU 已实测。
- 使用对应端序读取 program／section table，先检查范围再读取记录；检查 segment／section 文件范围及 LOAD 文件长度不超过内存长度，正确排除不占文件字节的 `SHT_NOBITS`。扩展计数暂不支持并明确拒绝，不静默漏审。
- glibc 检查仍调用 GNU `readelf --version-info --wide` 并保持 2.28 上限；旧八目标的完整批次集合、归档与二进制摘要门禁及 GNU 返回结构不变，不把三个候选提前并入交付清单。

格式依据为 [System V ELF header](https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.eheader.html)、[section](https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.sheader.html)、[program header](https://refspecs.linuxfoundation.org/elf/gabi4+/ch5.pheader.html)、[AAELF32 2025Q4](https://github.com/ARM-software/abi-aa/blob/2025Q4/aaelf32/aaelf32.rst) 与 [glibc 2.42 ELF 常量](https://github.com/bminor/glibc/blob/glibc-2.42/elf/elf.h)。合成测试数据仅验证解析器，不代表可运行的原生库。

本机只读资源盘点：Android SDK 的已知路径存在，含 NDK r27b（27.1.12297006）、API 35／36 与 platform-tools；NDK 内有两个 API 24 ARM linker 和 `llvm-readelf`，但未运行它们、未连接设备。Android／OHOS SDK 环境变量未设置，已检查的 DevEco SDK 路径不存在。盘点只覆盖约定环境变量和常见 SDK 根，不声称全盘不存在其他安装。本轮另为项目 Rust 安装七个候选标准库，以进行核心目标检查；它不安装移动 SDK，实际结果见[交付记录](../architecture/cross-platform-delivery-plan.md#本轮本地验证)。

2026-09-11 的本机盘点未在 PATH 或已检查系统路径找到 GNU `readelf`／`greadelf`；NDK 的 `llvm-readelf` 不替代现有 GNU 输出合同。真实 GNU readelf 与实际候选产物的正向端到端检查仍待 Linux 环境；客户端包缺失、已有包尚未运行、原生机器及移动宿主未确定分别按上表跟踪，不再统一记为 pnpm 缺包。

## 已通过：独立候选 CI 的编译与静态审计

[native-candidates.yml](../../.github/workflows/native-candidates.yml) 在 push／PR／手动运行时检查七个候选的 Rust 核心：安装各自标准库后执行目标 `cargo check`，不链接 Node addon、不运行测试。FreeBSD、Android 与 OHOS 不借此声称有可用的宿主绑定或 SDK。

三个 GNU 候选在 Ubuntu x64 另行复用 `build:node:gnu`，通过固定 CLI 的 `--use-napi-cross` 真正构建；随后复制一次 `.node`，审计这份副本并保存原始 bytes 与 `audit.json`。工件名包含源码 SHA、attempt 与 target，前缀独立于现有 `node-distribution`，不生成 batch，不进入八目标汇总或发布路径。

这两个 job 的工具运行在 Ubuntu x64 构建机，不需要在候选 CPU 上启动 pnpm。核心 job 只安装 Rust；GNU job 使用根 mise 选择 Rust／Node／pnpm，并冻结安装 workspace。CLI 3.9.1 使用锁定的 `@napi-rs/cross-toolchain@1.0.3`，其下载路径另经构建机的 `npm pack` 取得精确版本的工具链包；提交 `031fa79` 的三个 GNU job 已实际完成工具链准备、交叉构建与审计，而不只是验证 workspace 冻结安装。[CLI 构建源码](https://github.com/napi-rs/napi-rs/blob/7e3f293e2d6a3032eabfe51ff38bcaa82d342a2f/cli/src/api/build.ts)、[工具链元数据](https://registry.npmjs.org/@napi-rs/cross-toolchain/1.0.3)

候选汇总 gate 要求核心检查和 GNU 构建／静态审计都成功；上传失败证据不掩盖先前错误。Actions 沿用主 CI 的完整 SHA 固定。[运行 `34625060596`](https://github.com/matharts/ziwei/actions/runs/34625060596) 对应提交 `031fa79e507915ba13a73f1243cf2495432a76c4`，七项核心检查、三项 GNU 构建／静态审计与汇总 gate 共 11 个 job 全部通过。该结果证明构建机上的编译与审计路径可运行，不替代原生环境及 npm／pnpm 消费验收。

## 验证记录

### ppc64le／s390x 仿真消费

这是独立候选实验，不是新增正式支持。QEMU 用户态仿真可以运行目标架构程序，但共享构建机内核，不验证 POWER／IBM Z 真机、最低 CPU 或最低内核；固定 Debian 镜像也不等于 glibc 2.28 最低用户态验收。[Docker 仿真说明](https://docs.docker.com/build/building/multi-platform/#qemu)

1. GNU 构建 job 静态审计后，用 `pack:node:candidate` 封存原始 addon 和当次公共文件，不重新编译。复用既有打包器，仅临时包副本允许当前候选；正式八目标清单不变。
2. `candidate.json` 使用独立的 `node-candidate` 类型，包含 commit／run／attempt、目标、包版本、两个 tarball 与 addon 的大小和摘要；归档校验完成后才写清单。它不是正式 `batch.json`，不能进入八目标汇总或发布路径。
3. `check:node:candidate` 在 Linux x64 控制机上校验同批输入，再下载固定摘要的官方 Node 24.15.0、24.21.0 和 pnpm 12.4.1 客户端。QEMU action、binfmt 镜像和基础镜像均固定完整 SHA；摘要与版本来源集中于[控制器](../../packages/ziwei/tools/candidate-runtime.ts)。Node 摘要来自[最低版本清单](https://nodejs.org/dist/v24.15.0/SHASUMS256.txt)与[开发版本清单](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt)，pnpm 摘要来自上文两个平台包的固定版本元数据。
4. 两版 Node 使用同一份候选包和同一固定的 `24.15.0-bookworm-slim` 用户态。实际执行挂载的官方 Node 二进制，不依赖镜像预装版本；2026-09-12 查询的开发版镜像标签缺少 s390x，不能用浮动标签假装两目标齐全。消费容器无外网、无额外 capabilities，输入只读；仅本地注册表、临时缓存和结果目录可写。
5. 消费端检查实际 OS、CPU、端序、Node 与 glibc，随后通过安装后的公开包验证双入口、查询、错误身份、缓存、冻结、Worker 和 ESM／require 身份。npm／pnpm 各执行正常、禁用 optional、缺失包、损坏包四种场景，使用独立临时目录、锁文件与冷缓存。一个客户端或 Node 版本失败，不阻止另一个留下独立结果。
6. 每版 `consumer.json`、stdout／stderr 与总 `experiment.json` 单独保存，始终标记 `verification: "emulated"`，仅完整通过后置 `passed: true`。失败返回非零并保存已产生的结果；汇总 gate 同时要求编译、静态审计与两目标仿真成功，不使用 `continue-on-error`。

初轮实现只有本机工具、打包和共享消费链验证；首次远端执行结果见下方记录。合成 ELF 测试不能作为目标运行证据。须先验收同一提交的完整仿真结果，再补齐原生环境与最低系统合同，才讨论正式平台提升。

本步验证记录（2026-09-12，macOS arm64，基于 `f38b0ea` 的未提交工作树）：

- 开发 Node 24.21.0：`check:node:tools` 110 项、`check:node` 46 项及公开类型合同通过。新增 14 项候选测试覆盖封存、混批、摘要、目标元数据、宿主条件、容器参数、旧结果保护及正式八目标拒收候选。
- 最低 Node 24.15.0：候选工具 14 项与分发消费 14 项通过，包含 npm／pnpm、Worker 与失败分支。这些运行发生在本机 arm64，不是 ppc64le／s390x 的运行证据。
- 从[运行 `34632827266`](https://github.com/matharts/ziwei/actions/runs/34632827266)已下载的两份真实 addon 在本机完成候选打包；原始文件与 tarball 内 addon 的摘要一致。使用当前工作树的工具进行封存预检，没有执行目标二进制。
- TypeScript、Oxlint、Oxfmt、差异检查通过；workflow YAML、10 段 shell 与 64 种汇总状态组合通过，只有所有上游 job 成功时汇总才通过。实际 QEMU 镜像启动和目标客户端运行留给新提交的远端验收。

### 2026-09-12：首次仿真暴露的工程问题

[候选 CI `34641691181`](https://github.com/matharts/ziwei/actions/runs/34641691181) 与[主 CI `34641691172`](https://github.com/matharts/ziwei/actions/runs/34641691172) 均对应 `d8a30aa8ca027a7e9409bfcf5068f797a8daa38f`，结论均为失败，未重标为通过：

- 主 CI 的开发工具测试在产品构建前运行；新增的两项封存断言错误地依赖已有 `dist/native`。修复把这两项测试移至构建后的分发组，不跳过测试、不修改 CI 顺序。无生成目录时，108 项工具测试通过；构建后 49 项 Node 测试通过，另含新增加的调用目录隔离回归。
- 候选报告实际观察到 ppc64/LE 与 s390x/BE、Node 24.15.0／24.21.0、glibc 2.36。四组 npm 客户端全部通过正常及三种失败场景，包含公开包、双建盘入口、查询、错误、缓存、冻结和 Worker；这只是仿真用户态证据。
- 四组 pnpm 均在 `--version` 阶段失败：s390x 的 `ERR_PNPM_BAD_CONFIG_DEP` 表明版本探针读取控制工程配置并尝试联网解析 pnpm；ppc64le 收到 `SIGSEGV`。两者都未进入 pnpm 安装或 Ziwei 加载验证，不归因于引擎。
- 版本探针改在本次消费夹具的独立临时目录运行，仍严格核对 pnpm 12.4.1。以真实 pnpm 加载调用目录的无效 workspace 配置，已得到修复前失败、修复后通过的本地回归；不修改开发工程 `devEngines`，不启用外网或降低版本。该修复能否消除 ppc64le 崩溃，须等待同一新提交的远端结果。

### 2026-09-11：初轮实现

- 核对当时的 manifest、CLI 3.9.0 安装源码及 npm 注册表中的 `gitHead`；初轮源码证据固定到该发布提交，不把 `main` 当作已安装行为。
- 在线核对 Node 两固定版本的 BUILDING 与 SHA 清单、Rust 1.98.0 平台说明、pnpm 两份固定版本元数据、Android／OHOS 官方接口与环境资料。
- `compatibility.test.ts` 在开发 Node 24.21.0 与最低 Node 24.15.0 均通过 48 个测试；覆盖五种 GNU 布局、截断／错误 class／端序／flags／表与数据越界、候选文件边界、CLI 参数及既有八目标门禁回归。
- 两个 TypeScript 文件的 Oxfmt／Oxlint 与差异检查通过；完整工程及 TypeScript 集成检查由主任务统一执行，未以聚焦检查替代。
- 已安装 napi CLI 3.9.0 的 `parseTriple` 实际返回三个 GNU 后缀：`linux-arm-gnueabihf`、`linux-ppc64-gnu`、`linux-s390x-gnu`；对应 workflow 采用相同映射。
- 另执行 `rustc --print cfg` 获取七目标元数据；未执行候选 `cargo build`、目标加载测试、Node 移植、模拟器、云资源申请或公共发布。
- 七份目标标准库安装完成后，使用 `rustc 1.98.1 (48a229cea 2026-09-01)`，对本页七个候选逐项执行 `cargo check -p ziwei --lib --all-features --target <target> --locked --target-dir target/candidate-checks`；七项 exit code 均为 0。这是锁定依赖下的核心跨目标类型检查，不链接 addon，也没有执行目标代码。
- 本轮证据足以验证静态检查逻辑和区分可构建目标与可交付宿主；不证明任何一个候选已经通过原生产物验收。未来实现应重新固定 SDK、镜像、第三方 action 与设备版本。

### 2026-09-12：上游同步后的复核

- 当前基于 `5288908` 的未提交工作树；核对 pnpm 12.4.1、CLI 3.9.1 与 Rust 绑定新版本，未再次修改依赖、CI 行为或支持目标。
- 对照 pnpm／exe 两个固定版本及四个客户端包的官方元数据，区分“包存在”“能启动”“完整消费通过”；当前七项均没有新增宿主运行证据。
- 已安装 CLI 3.9.1 的 `parseTriple` 实测与三个 GNU workflow 后缀相同；`cross-toolchain` 1.0.3 的 x64／arm64 目标键均包含这三项。官方注册表中的三份 x64 构建机工具链包也存在：[armv7](https://registry.npmjs.org/@napi-rs/cross-toolchain-x64-target-armv7/1.0.3)、[ppc64le](https://registry.npmjs.org/@napi-rs/cross-toolchain-x64-target-ppc64le/1.0.3)、[s390x](https://registry.npmjs.org/@napi-rs/cross-toolchain-x64-target-s390x/1.0.3)。未下载或执行这些工具链。
- 候选 workflow 的 YAML 解析、七段 shell 语法、七核心／三 GNU 矩阵及与主 CI 一致的完整 Action SHA 检查通过。实际执行汇总 shell 的 16 种结果组合，只有两个 job 均为 `success` 时通过；没有用仿真构建来代替真实编译。
- `build:node:gnu` 的 mise dry-run 确认先原生后 TypeScript 的调用顺序；开发 Node 下 `check:node:tools -- tools/tests/compatibility.test.ts` 的 48 项检查通过，零失败、零跳过。
- 尚未提交、推送或触发远端 workflow。上述检查验证配置和本机审计器，不证明目标 addon 已构建、静态审计已在 Linux 运行或原生消费已通过。

### 2026-09-12：提交后的远端候选验收

- 已核验提交 `031fa79e507915ba13a73f1243cf2495432a76c4` 的[候选 CI](https://github.com/matharts/ziwei/actions/runs/34625060596)：11 个 job 全部成功，涵盖七目标核心检查、三项 GNU addon 交叉构建／静态审计及汇总 gate。
- 三个实际构建目标为 `armv7-unknown-linux-gnueabihf`、`powerpc64le-unknown-linux-gnu` 与 `s390x-unknown-linux-gnu`；它们仍是候选，不加入现有八目标分发批次或主包平台依赖。
- FreeBSD、Android 两 ABI 与 OpenHarmony 本轮只有核心类型检查证据；所有七目标仍缺对应宿主运行与独立消费验收。上节“尚未提交”等表述保留为提交前的历史记录，不代表当前状态。
