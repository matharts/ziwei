# Node 原生二进制分发提案

状态：2026-09-10 首批分发结构（D-263）、八目标独立分发验收、同批完整汇总（D-264）与无需 overrides 的隔离注册表安装验收（D-265）均已通过 CI，另七个仍为候选。D-266 的 GNU 构建、符号门禁与双架构 glibc 2.28／最低 Node 用户态验收也已通过。主包与平台包均未发布；该用户态实测不覆盖最低内核、全部旧系统或公共注册表分发。

## 当前事实

- 提交 `7e6ecc2e9021e12c340f74f8eb4a6006e184dbc9` 的 [CI 全部通过](https://github.com/matharts/ziwei/actions/runs/34490975361)（attempt 1，19 个任务）：GNU 双架构通过新交叉构建；完整交付 tarball 的必需 GLIBC 符号最高版本分别为 x64 的 2.14、arm64 的 2.17，均通过 2.28 上限检查。同一完整批次在实际 glibc 2.28／Node 24.15.0 的 x64、arm64 容器中，各通过 npm／pnpm 的正常、禁用 optional、缺失与损坏共八个场景；原有八目标注册表验收及最终门禁也通过。较低的符号版本不降低项目的 glibc 2.28 验收目标。

- 提交 `2074662ca55bd891ab7941589bbf598e2b259643` 的 [CI 全部通过](https://github.com/matharts/ziwei/actions/runs/34453935225)（attempt 1）：八个平台分别通过 npm／pnpm 的正常安装、禁用 optional、平台包缺失及 integrity 不符，共 64 个消费端场景；完整汇总、原有检查和最终 `verify` 均通过。Windows 首次验收发现 Git Bash 的 GNU tar 将盘符误当远程地址，已改为从 stdin 读取已校验的归档字节，未改变测试环境或放宽断言。
- 后续文档提交 `4bc46bce71db2f5f5fe5481b06f267978f661c94` 的 [CI 也全部通过](https://github.com/matharts/ziwei/actions/runs/34454666959)。对其完整交付包完成了[八目标静态兼容性审计](../engineering/node-binary-compatibility.md)：GNU 两目标均有必需的 `GLIBC_2.34` 引用；musl 动态依赖 libc，Windows 动态依赖 VC Runtime／UCRT。没有据此新增最低系统承诺或调整构建配置。
- 提交 `b9266dc33f246cc18092bb50a3eb8f8100b8478b` 的 [CI 全部通过](https://github.com/matharts/ziwei/actions/runs/34451527198)（attempt 1）：八目标产物封存、完整汇总和最终门禁通过。下载最终交付物后，九个 tarball 的大小与 SHA-256 均匹配 `batch.json`。
- 提交 `3d22b4b20503eed3df8857341e6acc007be2ed84` 的 [CI 已通过](https://github.com/matharts/ziwei/actions/runs/34419861484)（attempt 2）：六个原生 runner 通过完整测试与分发消费端合同，两个 musl 目标在对应架构的 Alpine 容器中通过分发消费端合同，质量检查与汇总门禁通过。Linux arm64 首次因 GitHub 证明校验接口 `502` 失败，同一提交重试通过；未关闭证明校验。
- [主包配置](../../packages/ziwei/package.json)声明八个首批目标，仍为 `private: true`。源码 manifest 不引用尚未发布的平台依赖；`optionalDependencies` 仅在暂存区生成，保持 workspace 冻结安装可用。当前仅有[检查工作流](../../.github/workflows/ci.yml)，没有发布工作流。
- 保留[自包含本地包测试](../../packages/ziwei/test/package.test.ts)，另增[分发测试](../../packages/ziwei/test/distribution.test.ts)：真正打包和离线安装无二进制主包与本机平台包，检查加载、公开 API、声明和失败路径。
- 平台包元数据由锁定的 napi-rs `NapiCli.createNpmDirs` 生成；不是手写第二套 CPU／OS／libc 映射。八项目标的元数据夹具不作为八个平台的运行证据。

## Rolldown 对照与候选平台

本轮核对 Rolldown `1.2.8`，源码固定在 `9704b565076baf57b3703c98ebde973855506a68`：主包精确引用 15 个已发布的原生平台包。另有 `@rolldown/binding-wasm32-wasi`，但它不在该版本主包的 `optionalDependencies` 中，不能混作第 16 个原生平台。逐项包元数据、构建矩阵和运行测试的证据见 [Rolldown 平台核验](../engineering/rolldown-platforms.md)。

这 15 个原生目标作为本项目的候选范围，按下表分批验收。平台包名沿用 napi-rs 的主包名加平台后缀；不照搬 Rolldown 的 `@rolldown/binding-*` 名称。

| 平台 | Rust target | 拟用平台包名 | 本项目状态／推进批次 |
| --- | --- | --- | --- |
| macOS arm64 | `aarch64-apple-darwin` | `@matharts/ziwei-darwin-arm64` | 第一批，真实分发验收通过 |
| macOS x64 | `x86_64-apple-darwin` | `@matharts/ziwei-darwin-x64` | 第一批，真实分发验收通过 |
| Windows x64 MSVC | `x86_64-pc-windows-msvc` | `@matharts/ziwei-win32-x64-msvc` | 第一批，真实分发验收通过 |
| Windows arm64 MSVC | `aarch64-pc-windows-msvc` | `@matharts/ziwei-win32-arm64-msvc` | 第一批，真实分发验收通过 |
| Linux x64 glibc | `x86_64-unknown-linux-gnu` | `@matharts/ziwei-linux-x64-gnu` | 第一批，真实分发验收通过 |
| Linux arm64 glibc | `aarch64-unknown-linux-gnu` | `@matharts/ziwei-linux-arm64-gnu` | 第一批，真实分发验收通过 |
| Linux x64 musl | `x86_64-unknown-linux-musl` | `@matharts/ziwei-linux-x64-musl` | 第一批，Alpine 实际运行通过 |
| Linux arm64 musl | `aarch64-unknown-linux-musl` | `@matharts/ziwei-linux-arm64-musl` | 第一批，Alpine 实际运行通过 |
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
- 保留 `private: true`、Rust 禁止发布设置及现有版本。CI 可上传本批验收所需的产物，不注册 npm 包名、创建 tag 或发布 npm／GitHub Release。`private` 是 npm 发布保护，不是 GitHub Actions 下载权限控制；Actions 产物的可见性由仓库权限决定。

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

一次本机打包只引用本次选中的平台包，不伪装成八平台交付；完整交付使用下文的同批产物汇总，不通过手工补齐二进制目录冒充已验收批次。

[分发消费端夹具](../../packages/ziwei/test/fixtures/distribution-consumer.ts)用 Node 自带 npm 离线安装本地 tarball，禁用安装脚本，以临时 consumer 的 overrides 将精确依赖指向平台 tarball。它验证主包无二进制、平台包内容、实际 CPU／libc、ESM／require 身份、建盘与查询，以及缺包、损坏二进制的失败；错误版本使用生成加载器的显式 `NAPI_RS_ENFORCE_VERSION_CHECK=1`。该版本检查默认不是强制保证。

正常 CI runner 还从已安装 tarball 验证 ESM／CJS 消费端声明；原有自包含包合同继续使用 pnpm。这里的 npm 是消费端兼容性测试，不替换仓库的 pnpm／mise。离线 overrides 验证不证明公共注册表安装或全矩阵可选依赖的自动筛选。

## 同批产物封存与汇总

[产物工具](../../packages/ziwei/tools/artifacts.ts)把单目标消费端验收与完整分发分开。目标清单仍来自主包的 `napi.targets`；公共文件集合与本地打包共用契约，不另维护平台列表。

1. 单目标消费端通过后，`capture:node` 封存刚才测试的主包／平台包 tarball，不重新打包或编译。封存目录 `node-distribution-<attempt>-<target>/` 含两个 tarball 和最后写入的 `manifest.json`，记录提交、run ID、attempt、包名、版本、目标及文件大小／SHA-256。同一封存目录不可覆盖。
2. CI 只上传已通过该任务全部检查的封存目录。汇总任务等待八个目标及质量门禁成功，仅下载当前运行、当前 attempt 的输入，并保留各目标独立目录。
3. `assemble:node` 要求目标齐全且无额外目录，逐个核对批次、版本、摘要、归档文件集合和包元数据。八份公共 JS、声明、加载器及说明必须字节一致。读取归档时仅把已知条目送到 stdout，不把下载文件中的路径直接解压到工作区。
4. 校验通过后，在新目录内组装一份主包，写入完整的精确同版本 `optionalDependencies`。八个平台 tarball 原样复制；主包重新打包后，再核对公共文件未变。`artifacts.json` 提供兼容现有工具的路径清单；最后写入的 `batch.json` 记录完整交付包、二进制与公共文件摘要及输入清单摘要，是完整汇总的完成标记。

CI 环境中的调用入口：

```sh
mise run capture:node -- --input <已验收的单目标暂存目录> --target <Rust target>
mise run assemble:node -- --input target/node-artifacts
```

两个任务均读取 `GITHUB_SHA`、`GITHUB_RUN_ID`、`GITHUB_RUN_ATTEMPT`，不推断或补造批次。输入缺失、损坏或混用批次时，在创建输出前失败；最终打包失败则不生成 `batch.json`。未完成目录不作为交付物上传。汇总过程不依赖本机 `dist/` 或 `native/`，不构建 Rust／TS，也不修改源码 manifest。

批次严格包含 attempt。只重跑失败 job 不会复用上一次 attempt 的产物；需要完整交付时，使用 **Re-run all jobs** 重建同一批次。输入与完整交付的 Actions 产物均短期保留，具体期限见工作流；过期后重新构建，不拼接其他 run。SHA-256 用于完整性核验与字节追溯，不等于签名、发布 provenance 或最低系统要求证明。

本地回归用八目标夹具验证完整汇总、拒绝混批／缺失／篡改及原样复制，不宣称八种本机运行能力。真实八平台汇总已在上述 CI 中完成；注册表自动选择是下一层独立验收。

## 隔离注册表安装验收

[注册表消费端夹具](../../packages/ziwei/test/fixtures/registry-consumer.ts)先核对完整批次、目标集和九个 tarball 的摘要，再启动仅监听 `127.0.0.1` 的只读 HTTP 服务。它按 npm 的[包元数据协议](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)提供固定的 metadata 与原始 tarball，不开放发布接口或转发外部注册表；不修改任何包的 `private` 或归档字节。仅损坏测试的 HTTP 响应故意偏离原始 integrity。

```sh
mise run check:node:registry -- <包含 batch.json 的完整交付目录>
```

每个 npm／pnpm 消费端只声明主包的精确版本，不使用 `file:`、overrides、平台参数或 `supportedArchitectures`。先生成真实 lockfile，再从独立冷缓存冻结安装，禁用生命周期脚本；临时配置隔离用户注册表配置、认证与内容存储。测试按实际 Node 的 CPU／OS／libc 断言仅下载并安装匹配的平台包，校验实际 `.node` 字节，并检查 ESM／require 单例、建盘、查询、错误与冻结。

同一夹具还验证禁用 optional dependencies、匹配平台 tarball 返回 404、tarball 与元数据 integrity 不符三类失败路径。optional 安装失败可能被包管理器忽略，因此不能只看安装退出码；缺失／损坏平台包不得通过导入，也不能由主包内二进制或用户环境覆盖救回。

本地回归只提供一个真实本机二进制，其余目标使用明确的假数据验证平台筛选；CI 的八平台注册表任务则下载同一完整交付包，不重新编译或重新打包。两个 musl 任务在对应 CPU 的 Alpine 中运行，先用容器随附 npm 安装与根 `devEngines` 相同版本的 pnpm 官方 musl 可执行包，禁用安装脚本，再执行只读注册表验收。该启动步骤只为提供兼容 Alpine 的测试客户端，不替换仓库的 mise／pnpm 管理方式。

这里验证真实包管理器的解析、平台筛选、完整性检查与加载，不模拟公共 npm 的账号权限、发布、访问控制、provenance 或完整 registry 服务行为，不构成发布授权。

## CI 配置与验证边界

六个 glibc／macOS／Windows 目标使用[明确 CPU 的 GitHub runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)，执行现有完整测试与新分发合同。两个 musl 目标分别在 Ubuntu x64／arm64 上使用 Zig 工具链构建，再在同架构 `node:24.21.0-alpine3.23` 容器中执行相同分发消费端夹具；不使用 CPU 仿真。Node 镜像自身对 musl 的实验性支持仍须保留。[Node Alpine 说明](https://github.com/nodejs/docker-node#nodealpine)

musl 构建使用 `build:node:musl`，以 napi-rs 支持的 `CARGO_BUILD_TARGET` 选择目标，复用原生与 TS 构建任务。mise 在该任务内锁定 Zig／cargo-zigbuild；原生任务的 `--cross-compile` 交给 napi-rs，后者为 musl 加入动态 CRT 参数。首轮 CI 已证明 Ubuntu 的 `musl-gcc` 路径缺少 `libgcc_s.so.1`，因此改用官方推荐的 Zig 路径，不链接宿主 glibc 的运行库。Alpine 仅包含运行时，声明在构建机检查，不复制 workspace 开发依赖。[napi-rs 交叉构建](https://napi.rs/docs/cross-build)

首批八目标均已通过上述 CI 的真实独立分发验收，运行时为 Node 24.21.0；Linux x64 glibc 另通过最低 Node 24.15.0 检查。musl 消费端不运行依赖 glibc 的 TypeScript 编译器，声明在构建机检查。本机另完成 macOS arm64 分发验收和 Linux x64 musl 交叉构建，但没有本机 Docker 运行证据。

当前工作流包含同批产物上传／下载、`Complete Node distribution` 汇总和八平台 `Registry` 消费端任务，均纳入最终 `verify` 门禁。它们不替代单平台验收；失败或跳过均不能让最终门禁通过。上述通过状态对应当前事实中列明的提交与 CI 运行，不自动外推至后续改动。不存在发布工作流或 npm 发布。

全部产物验收后，才讨论发布身份、npm scope 权限、支持底线和人工发布审批。未来发布应使用已验收的同一批产物，先完成平台包再发布主包；部分失败先对账，不能把不同二进制覆盖到同一版本。[napi-rs 发布与恢复](https://napi.rs/docs/deep-dive/release#recover-from-a-partial-release)

## GNU glibc 2.28 验收目标

D-266 选择 glibc 2.28 作为 Linux x64／arm64 GNU 包的验收目标，与 Node 24 的用户态基线对齐；不是把先前 `GLIBC_2.34` 产物直接标成兼容。Rust 工具链、Node 最低版本、八目标范围、包名及公开 API 均保持不变。

- **构建**：GNU runner 通过 `build:node:gnu` 调用 napi-rs 的 `--use-napi-cross`，再构建 TypeScript 并运行原有合同测试。CLI 及依赖由 pnpm 锁文件确定；GNU 交叉工具链使用较旧的 glibc sysroot，不继承 Ubuntu runner 的链接下限。实际符号需求仍须检查，不能仅凭编译选项承诺兼容。普通本机构建与 musl 的 Zig 路径不变。[官方 GNU 构建方式](https://napi.rs/docs/cross-build)
- **产物门禁**：完整批次汇总后、上传前，`check:node:glibc` 检查两个 GNU tarball。先核对批次、目标集、tarball／二进制摘要及 ELF64 架构，再用 GNU `readelf` 检查版本需求；高于 2.28、未知的 GLIBC 需求或缺失版本信息均失败。它保守检查全部版本需求，包括弱需求，不把版本定义或文件中的字符串当成依赖。平台包字节不改写，失败不上传完整交付包。
- **运行验收**：两个 GNU 注册表任务保留当前 runner 验收，再用同架构 `almalinux:8.10-20260902` 容器消费同一批完整 tarball。容器只挂载 mise 安装的 Node 24.15.0 运行时和只读仓库，不复制宿主系统库或 workspace 开发依赖；启动时断言实际 glibc 恰为 2.28、Node 版本和 CPU 匹配。安装运行所需系统包和同版本 pnpm 官方原生测试客户端，复用 npm／pnpm 的正常、禁用 optional、缺失及损坏四类合同，不重新打包或编译。[AlmaLinux 官方镜像清单](https://github.com/docker-library/official-images/blob/master/library/almalinux)

```sh
mise run build:node:gnu
mise run check:node:glibc -- <包含 batch.json 的完整交付目录>
```

GNU 构建要求 Linux x64／arm64；指定目标沿用 `CARGO_BUILD_TARGET`。符号检查要求 GNU binutils 的 `readelf`，由完整汇总的 Ubuntu runner 提供。两个跨构建选项互斥，错误组合由 napi-rs 拒绝；不使用当前 CLI 尚不支持的 `.2.28` target 后缀。

上述提交已完成 GNU 构建、实际产物符号检查，以及双架构 glibc 2.28／Node 24.15.0 的同批运行验收。该结论仅对应列明的提交、批次和环境；后续改动须重新经过同样门禁。容器共享宿主内核，不能据此承诺最低 Linux 内核或全部旧发行版。

## Windows x64 干净容器验收

现有 Windows 双架构 runner 继续验证实际包消费；`Windows x64 clean consumers` 额外检查不继承宿主开发软件的消费环境。正式门禁区分 Ziwei 的运行要求与 pnpm 自身的先决条件，不增加最低 Windows 版本承诺。

- **输入与环境**：[实验工具](../../packages/ziwei/tools/windows-container.ts)在 Windows x64 Docker 宿主运行，固定 Microsoft Server Core LTSC 2025 的 manifest digest，使用 process isolation。仅复制两个 manifest、必要的 TypeScript 测试文件及完整批次到临时只读挂载，结果目录单独可写；不挂载宿主 Node、运行库、Rust、MSVC 或 workspace 依赖。
- **Docker 预检**：就绪探测窗口最多 120 秒，单次 `docker info` 最多 10 秒，两次之间最多等待 2 秒；末次探测与等待按剩余预算裁剪。缺少可执行文件、输出超限、无效 JSON 或错误 OS／CPU 立即失败。`experiment.json.dockerAttempts` 逐次保存耗时、超时预算、退出状态和输出。探测前后另以 5～10 秒的独立命令限时记录客户端版本、当前 context／endpoint、三个服务（`docker`、`hns`、`vmcompute`）、`dockerd` 进程和近 15 分钟的相关 Windows 事件；每个事件来源最多取 30 条。诊断采集时间不计入 120 秒就绪窗口。
- **诊断边界**：只读宿主状态，不启动或重启服务、不切换 context、不降级 Docker。命令输出限制为 256 KiB，上传前过滤已知敏感环境值、认证字段与 URL 凭据／查询参数；不读取完整环境、进程命令行或 Docker 凭据文件。解析和就绪判定使用原始命令数据，报告只持有独立的脱敏副本；报告中的 stdout／stderr 是诊断文本，不保证保留其原始结构。诊断命令自身的失败也保留在报告中，不代替真实就绪判定。Windows runner 的额外测试实际执行同一 PowerShell 诊断脚本；本地模拟测试只证明等待、退出和证据保留机制。
- **Node 与运行库**：下载官方 Node 24.15.0 x64 ZIP，同时核对固定 SHA-256 与官方 `SHASUMS256.txt`，容器解压后拒绝 ZIP 内出现 DLL。默认依次启动两个全新容器：`npm-clean` 不安装额外运行库，也不安装或启动 pnpm；`pnpm-runtime` 先安装经校验的官方运行库，再用 Node 自带 npm 安装和根 `devEngines` 一致的 pnpm 可执行包，禁用安装脚本。两组均记录系统运行库路径、版本与摘要。`npm-clean` 拒绝开发工具链与普通 VC Runtime DLL，并核对实际加载模块；固定系统自带的 CLR 专用变体与 UCRT 单独保留，不删除 DLL 制造负例。
- **运行库对照**：显式传入 `--compare-vc-runtime` 时，先完成原基线，再从同一 digest 启动另一个全新容器；复用同一 Node ZIP、源码和只读 tarball 批次，唯一安装条件差异为 Microsoft 官方 x64 VC Redistributable。安装器固定下载地址、版本 `14.51.36247.0` 和 SHA-256；宿主只下载，容器内再次校验摘要，并要求 Authenticode 状态为 `Valid`、签名者为 Microsoft Corporation、文件版本匹配，之后才使用 `/install /quiet /norestart /log` 执行。保留安装器签名、版本、摘要、安装退出码、日志和安装前后 DLL 清单。退出码 3010 只记录需要重启，不执行重启、不代替真实消费测试。[官方下载入口](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)、[官方安装参数](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170#command-line-options-for-the-redistributable-packages)
- **消费与证据**：传入当前 commit／run／attempt，由原有注册表夹具核对完整 tarball 集合与摘要。npm／pnpm 分别使用独立注册表实例和冷缓存，各自执行正常、禁用 optional、缺失、损坏四个场景。pnpm 版本检查只属于 pnpm 分支；一个分支失败后仍执行另一个分支。`consumer.json.checks` 分别保留包管理器、阶段、通过状态、加载观察和错误消息／退出信息；`consumers` 保留平铺的加载观察。正常加载探针额外记录 Node 版本、CPU 和实际加载模块路径；即使原生导入失败也尽量保存该观察。仅提取报告必要字段，不上传完整 Node diagnostic report 中的环境变量。
- **失败传播**：Docker 不可用、镜像不兼容、材料校验失败或真实消费失败都使任务失败。正式门禁要求 `npm-clean` 与 `pnpm-runtime` 均通过；一个失败后仍执行另一个并保留证据。手动对照仍执行 `baseline`／`vc-runtime` 两组的全部 npm／pnpm 检查，失败如实传播，不把已知 pnpm 启动失败视为成功。根 `experiment.json.mode` 区分 `acceptance`／`comparison`，`scenarios` 汇总结果；每组独立子目录保存 `consumer.json`、退出／清理信息 `container.json` 及 stdout／stderr。任务纳入最终 `verify`，不使用 `continue-on-error`。结果目录不可覆盖；退出或超时后只清理本轮容器与临时输入，保留结果。工作流被取消时不保证报告上传。

在具备 Windows x64 Docker daemon 的宿主运行：

```sh
mise run check:node:windows -- <包含 batch.json 的完整交付目录> <新的结果目录>

# 按需诊断：两组均运行 npm/pnpm；已知失败仍返回非零，不属于日常门禁。
mise run check:node:windows -- <包含 batch.json 的完整交付目录> <新的结果目录> --compare-vc-runtime
```

首次远端运行 [34497803586](https://github.com/matharts/ziwei/actions/runs/34497803586) 对应提交 `9455a3c`、attempt 1：Docker 与固定镜像启动成功，Node 24.15.0 可运行，但 `pnpm.exe --version` 以 `3221225781` 退出。旧夹具的公共 pnpm 前置检查阻断了 npm 分支，`consumers` 为空，因此尚无该容器内的 Ziwei 加载结论。

分支隔离提交 `45c196c` 的 [CI 34557451358](https://github.com/matharts/ziwei/actions/runs/34557451358) 中，18 项任务通过；Windows 实验在宿主首次 `docker info` 时超时，最终汇总失败，尚未运行容器。该任务的 runner 镜像从 `20260824.214.3` 更新为 `20260907.229.1`，官方清单中的 Docker 从 29.1.5 更新为 29.7.2；这只是排查线索，不是版本回归的证明。

诊断提交 `00d961e` 的 [CI 34559509252](https://github.com/matharts/ziwei/actions/runs/34559509252) 中，Docker 29.7.2 的三个服务均正常运行，使用默认本地 named pipe，首次 `docker info` 在 4003 ms 内成功；随后脱敏改写 `Plugins.Authorization` 导致 JSON 解析失败。修复将解析与报告脱敏分离，并用真实子进程输出补充回归。这一结果确认该次 Docker 可用，不证明上一次超时的根因。

提交 `0efe848` 的 [CI 34561101352](https://github.com/matharts/ziwei/actions/runs/34561101352) 已进入容器：Docker 首次探测 7123 ms 成功；npm 安装和实际二进制摘要校验通过，但加载 `.node` 报 `The specified module could not be found.`；pnpm 仍在 `--version` 以 `0xC0000135` 退出。该同批 `.node` 直接导入 `VCRUNTIME140.dll`，容器 System32 清单缺少同名 DLL。18 项其他任务通过，容器和总门禁失败。用户随后授权上述运行库对照；对照结果以新 CI 的两组报告为准，不提前改变运行库部署或链接决策。

提交 `32a0241` 的 [CI 34562804795](https://github.com/matharts/ziwei/actions/runs/34562804795) 完成了运行库对照：两组安装前 DLL 清单、Node、pnpm 与 tarball 输入相同；基线复现 npm 原生加载失败及 pnpm `0xC0000135`，补充运行库后 npm／pnpm 的四个消费场景均通过，加载观察包含 `VCRUNTIME140.dll`。安装器签名有效、退出码为 0。基线仍失败，因此 CI 未通过；这确认该环境下的运行库缺失问题，不代表已经选择部署运行库的方案。

### Windows x64 静态 CRT

提交 `99840fb` 的 [CI 34566054495](https://github.com/matharts/ziwei/actions/runs/34566054495) 已验证静态候选：普通与延迟导入均无 VC Runtime DLL，原始 `.node` 从 514560 增至 607744 字节（增加 93184 字节，约 18.1%），封存包与受检文件逐字节一致。无额外运行库时 npm 四个场景均通过；pnpm 仍以 `0xC0000135` 启动失败，补齐运行库后两者均通过。原实验门禁仍失败，相关记录保留。

用户随后确认正式采用 x64 Node 静态 CRT，并调整验收合同。`build:node:native` 在任务内通过目标专属的 `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS` 默认设置 `-C target-feature=+crt-static`，本地与 CI 复用同一入口。仅改变 x64 MSVC addon 构建，不改变其他架构或独立 Cargo 命令；显式目标参数覆盖只供受控诊断，日常产物必须通过静态依赖检查。[Rust CRT 链接说明](https://doc.rust-lang.org/reference/linkage.html#static-and-dynamic-c-runtimes)、[Cargo 目标参数](https://doc.rust-lang.org/cargo/reference/config.html#targettriplerustflags)

`check:node:windows-crt -- <dynamic|static> <二进制路径> <新的证据目录>` 保存对应模式的实际 `.node` 及 JSON，记录原始文件大小、SHA-256、构建批次、普通与延迟导入；`rustflags` 仅记录检查进程继承的目标参数，没有继承时为 null。检查器验证 PE32+ x64 DLL、目录与 section 边界；动态基线必须导入 `VCRUNTIME140.dll`，静态产物不得残留 VC Redistributable DLL 导入。它不枚举运行时主动加载或传递依赖，因此仍须真实消费验证。[Microsoft PE 格式](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)

原生模块构建并检查后，只构建 TypeScript 层、运行 Node 与类型合同，禁止通过聚合任务再次构建 DLL。实际测试产物进入同 commit／run／attempt 的完整封存批次，再由两条正式容器门禁消费。`windows-crt-<attempt>` 保留静态文件与报告；核对其摘要与完整批次一致后才能关联依赖和加载结果。日常不再重复动态构建；手动运行 `ci.yml` 并启用 `compare_windows_crt` 才额外构建、保存动态基线，随后仍验收静态交付包。

Server Core 结果不能替代 Windows 11、arm64 或最低系统验收；双架构完整路径与官方依据见 [Windows 干净环境研究](../engineering/windows-clean-environment-research.md)。没有新增发布流程。

## 发布前剩余门槛

GNU glibc 2.28 的同批验收已完成；[静态审计](../engineering/node-binary-compatibility.md)中其他平台的最低环境、内核与运行时依赖边界仍需实测。之后核验 npm scope 权限和正式发布流程并取得发布授权。其余七项逐一落实运行环境，WASI 另议。
