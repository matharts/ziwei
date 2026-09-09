# Rolldown 平台分发参考

核对日期：2026-09-10。本页记录上游事实，不定义 Ziwei 的支持承诺。

## 版本与证据范围

- 查询时 npm `latest` 为稳定版 **`1.2.8`**；以下所有 npm 链接固定到该版本。[主包元数据](https://registry.npmjs.org/rolldown/1.2.8)
- 查询时 `main` 与 `v1.2.8` 标签均解析到 **`9704b565076baf57b3703c98ebde973855506a68`**；源码链接全部固定此 SHA。当前两者目标列表一致，不表示未来 `main` 等同于稳定版。[提交](https://github.com/rolldown/rolldown/commit/9704b565076baf57b3703c98ebde973855506a68)、[标签解析](https://api.github.com/repos/rolldown/rolldown/commits/v1.2.8)
- `napi.targets` 声明 **16 个编译目标：15 个原生目标与 1 个 WASI 目标**；稳定主包 `optionalDependencies` 只有 15 个原生平台包，均精确依赖 `1.2.8`。[目标声明](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/packages/rolldown/package.json#L160-L193)、[已发布依赖](https://registry.npmjs.org/rolldown/1.2.8)
- 平台子包目录由发布流程执行 `napi create-npm-dirs` 生成；不能把源码目录不存在理解为平台没有发布。本次以每个 npm 版本的元数据和 tarball 内 `package.json` 核对实际分发。[发布流程](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/publish-to-npm.yml#L80-L97)

## 原生平台与包名

下表 15 项均同时满足：存在于上述 `napi.targets`、有 release 构建配置、在 npm 发布 `1.2.8` 平台包且被主包列为可选依赖。
每行包名链接指向实际发布元数据；Rust target 来自固定 SHA 的目标声明。`cpu` 使用 npm 的名称，ABI 列保留 target 的区别；空缺 `libc` 字段不等于产物不依赖系统 C 库。

| OS / npm `os` | npm `cpu` | libc / 系统 ABI | Rust target | npm 平台包（均为 `1.2.8`） |
| --- | --- | --- | --- | --- |
| macOS / `darwin` | `arm64` | Apple Darwin | `aarch64-apple-darwin` | [@rolldown/binding-darwin-arm64](https://registry.npmjs.org/@rolldown%2Fbinding-darwin-arm64/1.2.8) |
| macOS / `darwin` | `x64` | Apple Darwin | `x86_64-apple-darwin` | [@rolldown/binding-darwin-x64](https://registry.npmjs.org/@rolldown%2Fbinding-darwin-x64/1.2.8) |
| Windows / `win32` | `x64` | MSVC | `x86_64-pc-windows-msvc` | [@rolldown/binding-win32-x64-msvc](https://registry.npmjs.org/@rolldown%2Fbinding-win32-x64-msvc/1.2.8) |
| Windows / `win32` | `arm64` | MSVC | `aarch64-pc-windows-msvc` | [@rolldown/binding-win32-arm64-msvc](https://registry.npmjs.org/@rolldown%2Fbinding-win32-arm64-msvc/1.2.8) |
| Linux / `linux` | `x64` | `glibc` / GNU | `x86_64-unknown-linux-gnu` | [@rolldown/binding-linux-x64-gnu](https://registry.npmjs.org/@rolldown%2Fbinding-linux-x64-gnu/1.2.8) |
| Linux / `linux` | `arm64` | `glibc` / GNU | `aarch64-unknown-linux-gnu` | [@rolldown/binding-linux-arm64-gnu](https://registry.npmjs.org/@rolldown%2Fbinding-linux-arm64-gnu/1.2.8) |
| Linux / `linux` | `x64` | `musl` | `x86_64-unknown-linux-musl` | [@rolldown/binding-linux-x64-musl](https://registry.npmjs.org/@rolldown%2Fbinding-linux-x64-musl/1.2.8) |
| Linux / `linux` | `arm64` | `musl` | `aarch64-unknown-linux-musl` | [@rolldown/binding-linux-arm64-musl](https://registry.npmjs.org/@rolldown%2Fbinding-linux-arm64-musl/1.2.8) |
| Linux / `linux` | `arm` | GNU EABI hard-float；未填 `libc` | `armv7-unknown-linux-gnueabihf` | [@rolldown/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@rolldown%2Fbinding-linux-arm-gnueabihf/1.2.8) |
| Linux / `linux` | `ppc64` | `glibc` / GNU；target 为小端 | `powerpc64le-unknown-linux-gnu` | [@rolldown/binding-linux-ppc64-gnu](https://registry.npmjs.org/@rolldown%2Fbinding-linux-ppc64-gnu/1.2.8) |
| Linux / `linux` | `s390x` | `glibc` / GNU | `s390x-unknown-linux-gnu` | [@rolldown/binding-linux-s390x-gnu](https://registry.npmjs.org/@rolldown%2Fbinding-linux-s390x-gnu/1.2.8) |
| FreeBSD / `freebsd` | `x64` | FreeBSD 系统 ABI | `x86_64-unknown-freebsd` | [@rolldown/binding-freebsd-x64](https://registry.npmjs.org/@rolldown%2Fbinding-freebsd-x64/1.2.8) |
| OpenHarmony / `openharmony` | `arm64` | OHOS ABI | `aarch64-unknown-linux-ohos` | [@rolldown/binding-openharmony-arm64](https://registry.npmjs.org/@rolldown%2Fbinding-openharmony-arm64/1.2.8) |
| Android / `android` | `arm64` | Android ABI | `aarch64-linux-android` | [@rolldown/binding-android-arm64](https://registry.npmjs.org/@rolldown%2Fbinding-android-arm64/1.2.8) |
| Android / `android` | `arm` | Android EABI | `armv7-linux-androideabi` | [@rolldown/binding-android-arm-eabi](https://registry.npmjs.org/@rolldown%2Fbinding-android-arm-eabi/1.2.8) |

`ppc64` 是实际 npm CPU 字段和包名片段，不能将其扩写成支持 PowerPC 大端；`arm` 也不能将两个 ARMv7 target 扩写成任意 ARM 设备。没有列出的目标（例如 Windows ia32、Linux riscv64）不在此版本的目标清单及主包分发矩阵中。[目标声明](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/packages/rolldown/package.json#L164-L180)

上游入门文档按 Node.js v24 的 Tier 1、Tier 2、Experimental、Other 分组展示这些平台；这种分组不是逐目标运行测试记录，也不是本项目的分级决策。[官方平台列表](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/docs/guide/getting-started.md#L35-L58)

## WASI / WebAssembly 单列

| 层次 | 编译目标 / 包 | 确认的分发事实 |
| --- | --- | --- |
| WASI 绑定 | `wasm32-wasip1-threads` → [@rolldown/binding-wasm32-wasi@1.2.8](https://registry.npmjs.org/@rolldown%2Fbinding-wasm32-wasi/1.2.8) | 已发布；入口为 `rolldown-binding.wasi.cjs`，含 `.wasm`；manifest 未设置 `os` / `cpu` / `libc`；不在稳定主包的可选依赖中。 |
| 浏览器封装 | [@rolldown/browser@1.2.8](https://registry.npmjs.org/@rolldown%2Fbrowser/1.2.8) | 另行发布的浏览器包，依赖 emnapi 与 WASM runtime；不增加一种原生 CPU / OS 组合。 |

WASI 是运行时与编译目标维度，不能计为另一个 Windows/Linux 硬件平台。该 target 还显式启用 `simd128`；`wasip1-threads` 与生成的运行时胶水均是部署要求的一部分。[编译配置](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.cargo/config.toml#L28-L29)、[WASI 包依赖](https://registry.npmjs.org/@rolldown%2Fbinding-wasm32-wasi/1.2.8)

加载器具备 native 失败后尝试 WASI 的路径，并提供 `NAPI_RS_FORCE_WASI` 控制；这只能证明加载逻辑存在。当前主包依赖未列 WASI 包，tarball 中也没有 `.wasm`，因此不能推断普通安装已经准备好 fallback。官方文档的 Wasm 下载/回退说明应与此版本实际包内容一起读。[加载器](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/packages/rolldown/src/binding.cjs#L543-L685)、[主包](https://registry.npmjs.org/rolldown/1.2.8)、[官方说明](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/docs/guide/getting-started.md#L60-L80)

## 构建、发布与运行验证的界限

| 证据层 | 本次确认 | 不能由此推出 |
| --- | --- | --- |
| 目标声明 | `napi.targets` 包含上述 16 个 target。 | 仅列 target 就已有可用二进制。 |
| release 构建配置 | 通用矩阵构建 14 个原生 target + WASI；FreeBSD 单独构建。GNU Linux 使用 `--use-napi-cross`，musl 使用 Zig 交叉构建路径。[配置](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/reusable-release-build.yml#L12-L175) | 交叉构建产物已在对应目标机运行通过。 |
| npm 发布流程 | 生成平台包目录、搬运构建产物并执行发布；主包的 `prepublishOnly` 调用 `napi pre-publish`。[工作流](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/publish-to-npm.yml#L80-L134)、[脚本](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/packages/rolldown/package.json#L109-L131) | 配置存在就代表任意一轮远端发布成功。 |
| 已发布产物 | 本次读取主包、15 个原生包与 WASI 包的 17 个 tarball，SHA-512 均匹配各自 registry 的 `dist.integrity`；平台包 manifest 核对一致，每个原生包含入口 `.node`，WASI 包含 `.wasm`。各行 npm 链接的 `dist.tarball` 可回溯产物。 | 二进制已在所有设备、系统版本上加载和运行通过。 |
| 常规 Node 测试配置 | Linux 宿主覆盖 Node 20/22/24；macOS、Windows 使用 Node 24，执行条件不同；复用 workflow 运行 Node/Rollup 测试和示例。[调度](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/ci.yml#L127-L168)、[测试内容](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/reusable-node-test.yml#L49-L68) | 已覆盖 15 个原生 target 的逐项运行矩阵。 |
| WASI 测试配置 | Ubuntu 上配置专用测试；明确存在带原因的跳过项，并对已知 flaky 场景重试。[WASI workflow](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/reusable-wasi.yml#L35-L82) | WASI 与原生具有完全相同的能力或稳定性。 |

本次未查询远端 CI run 的逐项结果，未安装这些包、执行目标构建或加载原生产物。已发布判断来自 npm 实际产物；运行验证判断仅限已读到的 CI 配置。

## 最低版本与尚未确定的边界

- 主包和上述原生平台包的 Node 门槛为 `^20.19.0 || >=22.12.0`。[主包 engines](https://registry.npmjs.org/rolldown/1.2.8)
- 独立 WASI 包的 Node 门槛更窄，为 `^20.19.0 || ^22.13.0 || >=23.5.0`；不能只沿用主包门槛。[WASI engines](https://registry.npmjs.org/@rolldown%2Fbinding-wasm32-wasi/1.2.8)
- 本次查阅的 Rolldown 文档、manifest 与构建配置没有给出覆盖各平台的最低操作系统版本、Linux kernel、glibc/musl 版本或 Android API level 承诺；这些下限保持**未确定**，不能由包名、Node 范围或 `--use-napi-cross` 推算成已验证结论。[官方平台说明](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/docs/guide/getting-started.md#L35-L80)、[构建配置](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/reusable-release-build.yml#L12-L175)
- FreeBSD 构建明确使用 **15.0** 虚拟机；这是构建环境证据，未验证为最低可运行版本。[FreeBSD job](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/.github/workflows/reusable-release-build.yml#L132-L175)
- 本次没有对产物执行 ELF/Mach-O/PE 依赖、符号版本或最低系统标记审计，也没有确定有效的 Node-API feature 下限；以上 ABI 列描述 target 的系统 ABI，不替代 Node-API 版本核验。
