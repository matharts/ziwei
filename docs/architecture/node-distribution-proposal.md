# Node 原生二进制分发提案

状态：2026-09-10 已确认并实施首批分发结构（D-263）。首批八个目标进入构建与验收配置，另七个仍为候选；配置完成不等于所有平台已实测。本轮只做本地打包和 CI 配置，不发布。

## 当前事实

- 提交 `e2ed1b32d492cb8a142f7fd6d6a5686ec1f8131a` 的 [CI 已通过](https://github.com/matharts/ziwei/actions/runs/34405852384)，覆盖当前三个 runner 的构建、Node 工具及包合同检查；这不等于发布产物已验收，也不证明最低 OS、glibc 或 SDK 版本兼容。
- [主包配置](../../packages/ziwei/package.json)声明八个首批目标，仍为 `private: true`。源码 manifest 不引用尚未发布的平台依赖；`optionalDependencies` 仅在暂存区生成，保持 workspace 冻结安装可用。当前仅有[检查工作流](../../.github/workflows/ci.yml)，没有发布工作流。
- 保留[自包含本地包测试](../../packages/ziwei/test/package.test.ts)，另增[分发测试](../../packages/ziwei/test/distribution.test.ts)：真正打包和离线安装无二进制主包与本机平台包，检查加载、公开 API、声明和失败路径。
- 平台包元数据由锁定的 napi-rs `NapiCli.createNpmDirs` 生成；不是手写第二套 CPU／OS／libc 映射。八项目标的元数据夹具不作为八个平台的运行证据。

## Rolldown 对照与候选平台

本轮核对 Rolldown `1.2.8`，源码固定在 `9704b565076baf57b3703c98ebde973855506a68`：主包精确引用 15 个已发布的原生平台包。另有 `@rolldown/binding-wasm32-wasi`，但它不在该版本主包的 `optionalDependencies` 中，不能混作第 16 个原生平台。逐项包元数据、构建矩阵和运行测试的证据见 [Rolldown 平台核验](../engineering/rolldown-platforms.md)。

这 15 个原生目标作为本项目的候选范围，按下表分批验收。平台包名沿用 napi-rs 的主包名加平台后缀；不照搬 Rolldown 的 `@rolldown/binding-*` 名称。

| 平台 | Rust target | 拟用平台包名 | 本项目状态／推进批次 |
| --- | --- | --- | --- |
| macOS arm64 | `aarch64-apple-darwin` | `@matharts/ziwei-darwin-arm64` | 已完成本机平台包分发验收；本次 CI 待运行 |
| macOS x64 | `x86_64-apple-darwin` | `@matharts/ziwei-darwin-x64` | 第一批新增 |
| Windows x64 MSVC | `x86_64-pc-windows-msvc` | `@matharts/ziwei-win32-x64-msvc` | 现有目标，已完成当前 CI；平台包分发待验收 |
| Windows arm64 MSVC | `aarch64-pc-windows-msvc` | `@matharts/ziwei-win32-arm64-msvc` | 第一批新增 |
| Linux x64 glibc | `x86_64-unknown-linux-gnu` | `@matharts/ziwei-linux-x64-gnu` | 现有目标，已完成当前 CI；平台包分发待验收 |
| Linux arm64 glibc | `aarch64-unknown-linux-gnu` | `@matharts/ziwei-linux-arm64-gnu` | 第一批新增 |
| Linux x64 musl | `x86_64-unknown-linux-musl` | `@matharts/ziwei-linux-x64-musl` | 第一批新增，独立 libc 运行验收 |
| Linux arm64 musl | `aarch64-unknown-linux-musl` | `@matharts/ziwei-linux-arm64-musl` | 第一批新增，独立 libc 运行验收 |
| Linux armv7 glibc | `armv7-unknown-linux-gnueabihf` | `@matharts/ziwei-linux-arm-gnueabihf` | 第二批候选，先落实运行环境 |
| Linux ppc64le glibc | `powerpc64le-unknown-linux-gnu` | `@matharts/ziwei-linux-ppc64-gnu` | 第二批候选，先落实运行环境 |
| Linux s390x glibc | `s390x-unknown-linux-gnu` | `@matharts/ziwei-linux-s390x-gnu` | 第二批候选，先落实运行环境 |
| FreeBSD x64 | `x86_64-unknown-freebsd` | `@matharts/ziwei-freebsd-x64` | 第二批候选，先落实运行环境 |
| OpenHarmony arm64 | `aarch64-unknown-linux-ohos` | `@matharts/ziwei-openharmony-arm64` | 第二批候选，先核验宿主兼容性 |
| Android arm64 | `aarch64-linux-android` | `@matharts/ziwei-android-arm64` | 第二批候选，先核验宿主兼容性 |
| Android armv7 | `armv7-linux-androideabi` | `@matharts/ziwei-android-arm-eabi` | 第二批候选，先核验宿主兼容性 |

第一批是现有三项加五项，共八个桌面／服务器目标；第二批七项不提前承诺交付日期或正式支持。批次是本项目决定，不是 Rolldown 的支持分级。Windows x86、Linux riscv64／loong64 等不在此次对照版本的原生包清单内，不因为 napi-rs 能识别其 target 就自动加入。

### 不能直接照搬的兼容性承诺

- Node `>=24.15.0` 保持不变。Node `v24.21.0` 的平台说明将 Android 列为不支持，Linux armv7 与 x64 musl 列为 Experimental；这些组合需要本项目单独的运行环境与验收，不能只凭 Rolldown 有平台包就宣称可用。[Node 24 平台说明](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#platform-list)、[Android 说明](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#android)
- 最低系统版本取决于 Node、构建工具链、原生依赖和实际产物的共同约束。上述 Node 文档列出的 macOS 门槛为 13.5、Linux glibc x64／arm64 门槛为 2.28；它们不是本库已经验证的最低版本，也不能用更低的二进制编译目标覆盖运行时要求。
- `.node` 的 ABI 稳定不覆盖操作系统、CPU、libc 和第三方运行时；CLI 能解析目标也不等于具备完整构建和发布路径。[napi-rs 兼容性说明](https://napi.rs/docs/more/support-compatibility)
- Rolldown 的 WASI／浏览器路线单独记录，本轮不据此增加 Ziwei 的 Wasm adapter、自动回退或浏览器支持。需要时另行设计。

## 一个主包，按已验收目标分发原生产物包

用户只安装和导入 `@matharts/ziwei`。主包保留现有 TypeScript interface，平台差异由生成加载器与包管理器处理，不增加一个只转发的中间 npm 包，也不拆分 Rust 引擎。

主包与平台包共同完成分发；公开导出、Rust／TS 职责及领域行为保持不变。

`@matharts/ziwei` 发布单份 ESM、公开声明、生成加载器与说明文件，正式分发时不夹带 `.node`。每个平台包只包含对应的一个 `.node`、必要元数据和许可证；`os`、`cpu` 及 Linux 的 `libc` 必须与实际产物匹配。GNU 包使用 `glibc`，musl 包使用 `musl`；ppc64le 对应的 npm CPU 为 `ppc64`，但实际目标仍须是 little-endian。

主包通过 `optionalDependencies` 引用本次实际交付平台包的相同精确版本，不用 `^` 或 `~`；未验收的候选不写成已发布依赖。平台包只承载产物，不复制 TypeScript 门面、领域逻辑或公开声明。这是 [napi-rs 官方分发模型](https://napi.rs/docs/deep-dive/release#distribution-model)；平台包不是新的业务模块。

这里的 optional 表示包管理器可以忽略不适用或安装失败的平台依赖，不表示本库能脱离原生模块运行。若用户省略 optional dependencies，安装可能成功而导入失败，加载错误必须能帮助定位缺失包。[npm optionalDependencies](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#optionaldependencies)

这一方案减少无关平台下载，代价是版本同步和多包发布的维护成本。

## 保留的加载与工程约定

- 开发构建仍可加载 `packages/ziwei/native/` 中的本机产物；发布暂存区剔除主包中的 `.node`，确保实际走平台包加载路径。
- 继续使用 napi-rs 生成加载器，不手改生成文件。内部 `binding.cjs` 不代表恢复 CJS 双构建；用户的 `import` 与 `require(ESM)` 仍进入同一主包入口。
- 保留[现有包装合同](node-api-design.md#9-包装与兼容性目标)：不通过安装脚本下载二进制，不自动从源码编译，不新增 Wasm 分发或回退产物。napi 生成加载器本身包含通用 WASI 探测分支，不据此声明支持。
- `bindings/node`、`crates/ziwei` 与 `packages/ziwei/src` 的职责不变。平台包目录是分发产物，不据此增加 Cargo crate 或含开发源码的 workspace 包。
- 平台元数据从调用方明确选择的首批目标列表生成，开发任务继续由 mise 编排。[生成平台目录](https://napi.rs/docs/cli/create-npm-dirs)、[程序接口](https://napi.rs/docs/cli/programmatic-api)
- 本步保留 `private: true`、Rust 禁止发布设置及现有版本；不注册 npm 包名、不创建 tag、不上传产物。

## 本地打包与验收

[打包工具](../../packages/ziwei/tools/pack.ts)只承担分发组装，不调度构建、测试或发布。先运行 `mise run build:node`，再运行：

```sh
mise run pack:node -- --target aarch64-apple-darwin
```

替换成实际已构建 target；`--target` 可重复指定，`--output` 可选择输出父目录。所有选中目标的二进制和公共构建文件必须存在且非空，缺失、未知或重复目标直接失败，不静默缩减交付集。任务不清空旧目录，每次在 `target/node-distribution/ziwei-<随机标识>/` 下创建新暂存区：

- `main/`：单份 ESM、声明、原样复制的生成加载器和说明／许可证，无 `.node`。
- `platforms/<suffix>/`：每个选中目标的二进制和元数据／许可证。
- `ziwei.tgz` 与 `<Rust target>.tgz`：真实打包产物；所有包均保留 `private: true`。
- `artifacts.json`：所有 tarball 成功打包后写出的相对路径清单；没有该文件的目录不视为打包完成。

一次本机打包只引用本次选中的平台包，不伪装成八平台交付；未来完整交付必须收齐并逐项验收同批产物，再组成完整主包。

[分发消费端夹具](../../packages/ziwei/test/fixtures/distribution-consumer.ts)用 Node 自带 npm 离线安装本地 tarball，禁用安装脚本，以临时 consumer 的 overrides 将精确依赖指向平台 tarball。它验证主包无二进制、平台包内容、实际 CPU／libc、ESM／require 身份、建盘与查询，以及缺包、损坏二进制的失败；错误版本使用生成加载器的显式 `NAPI_RS_ENFORCE_VERSION_CHECK=1`。该版本检查默认不是强制保证。

正常 CI runner 还从已安装 tarball 验证 ESM／CJS 消费端声明；原有自包含包合同继续使用 pnpm。这里的 npm 是消费端兼容性测试，不替换仓库的 pnpm／mise。离线 overrides 验证不证明公共注册表安装或全矩阵可选依赖的自动筛选。

## CI 配置与验证边界

六个 glibc／macOS／Windows 目标使用[明确 CPU 的 GitHub runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)，执行现有完整测试与新分发合同。两个 musl 目标分别在 Ubuntu x64／arm64 上使用同架构 `musl-gcc` 构建，再在同架构 `node:24.21.0-alpine3.23` 容器中执行相同分发消费端夹具；不使用 CPU 仿真。Node 镜像自身对 musl 的实验性支持仍须保留。[Ubuntu musl-tools](https://packages.ubuntu.com/noble/musl-tools)、[Node Alpine 说明](https://github.com/nodejs/docker-node#nodealpine)

musl 构建复用 `build:node`，以 napi-rs 支持的 `CARGO_BUILD_TARGET` 选择目标、Cargo linker 环境变量选择 `musl-gcc`；napi-rs 为 musl 加入动态 CRT 参数。Alpine 仅包含运行时，声明在构建机检查，不复制 workspace 开发依赖。[napi-rs 构建](https://napi.rs/docs/cli/build)

本机已验证 macOS arm64 的真实分发路径、八目标元数据及 CI 静态检查；本机无 Docker，其他目标、Alpine 运行及本次远端 CI 尚未验证。不存在发布工作流、产物上传或 npm 发布。

全部产物验收后，才讨论发布身份、npm scope 权限、支持底线和人工发布审批。未来发布应使用已验收的同一批产物，先完成平台包再发布主包；部分失败先对账，不能把不同二进制覆盖到同一版本。[napi-rs 发布与恢复](https://napi.rs/docs/deep-dive/release#recover-from-a-partial-release)

## 发布前剩余门槛

取得本次八目标 CI 的真实运行证据、验证完整可选依赖的平台筛选及注册表安装、确定最低系统要求、核验 npm scope 权限并取得发布授权。其余七项逐一落实运行环境，WASI 另议。
