# Node 原生产物兼容性审计

审计日期：2026-09-10。范围仅为下述已通过 CI 的同批八个 `.node`；这是静态依赖清单，不是最低系统支持承诺。本轮没有重新构建、修改链接参数、扩展平台或发布包。

> 历史记录：本文固定于提交 `4bc46bc`，原始依赖、版本与摘要保持不变。后续 GNU 构建与 Windows x64 CRT 策略已调整，八目标最低 Node 消费验收也已补齐；当前批次与验证边界见[首批兼容性验收总览](../architecture/node-distribution-proposal.md#首批兼容性验收总览)。本文不能作为当前产物的依赖清单。

## 结论

该历史批次的 Linux GNU x64／arm64 产物存在必需的 `GLIBC_2.34` 符号引用，不能直接交付给标准 glibc 2.28 环境。glibc 2.34 只是这批二进制的必要符号版本下限，尚未证明包含内核、运行库及 Node 的完整环境在该下限可用。

macOS 产物的部署标记低于当前 Node 运行时的系统要求，不能拿这些标记降低 npm 包门槛。Windows 产物动态依赖 VC Runtime／UCRT；musl 产物动态依赖 `libc.so`，不是自包含静态库。这些平台仍需要最低版本环境实测。

按 napi-rs 的兼容性边界，Node-API ABI 稳定不覆盖操作系统、CPU、libc、C++ 运行库或部署目标。[napi-rs 官方说明](https://napi.rs/docs/more/support-compatibility#node-api-abi-compatibility)

## 批次与方法

| 项目 | 本次证据 |
| --- | --- |
| 源码提交 | `4bc46bce71db2f5f5fe5481b06f267978f661c94` |
| CI | [34454666959，attempt 1](https://github.com/matharts/ziwei/actions/runs/34454666959)，全部成功 |
| 完整交付物 | `node-distribution-1`，artifact ID `10143185373` |
| 包 | `@matharts/ziwei@1.0.0-dev.0`，仍为 private |
| 构建配置 | Rust 1.98.1、napi 3.12.2、`napi8`；musl 使用 Zig 0.16.0 与 cargo-zigbuild 0.23.4 |
| 检查工具 | Apple LLVM `objdump` 21.0.0、bsdtar 3.5.3；使用本机现有工具，没有新增项目依赖 |

下载 `node-distribution-1` 后，先核对 `batch.json` 中的提交、run ID、attempt 和完整八目标集合，再计算九个 tarball 的大小／SHA-256。读取归档内指定 `.node` 到内存，核对八个文件的大小／SHA-256 与 `binaryDigest` 一致，随后才交给二进制检查工具。没有把归档内任意路径解压到工作区，没有执行被审计的二进制。

九个 tarball 与八个原生文件摘要全部匹配；八个平台包各有一个 `.node`，实际格式／架构与包的 OS／CPU／libc 元数据一致。平台包没有额外携带 `.dll`、`.so` 或 `.dylib`。GitHub Actions 下载接口曾发生一次连接重置，重试成功；没有换用其他 run 的产物。

ELF 与 PE 使用 `objdump --file-headers --private-headers`，ELF 另查 `--dynamic-syms`；Mach-O 使用 `--macho --private-headers --dylibs-used --rpaths`。以 load command 或 import／dynamic table 判定依赖，不根据文件中的普通字符串猜测。[LLVM 工具说明](https://llvm.org/docs/CommandGuide/llvm-objdump.html)

## 八目标清单

下表的版本来自二进制元数据或必需符号，不表示已经在该版本的完整系统上运行。

| Rust target | 实际格式／架构 | 静态版本证据 | 直接动态依赖 |
| --- | --- | --- | --- |
| `aarch64-apple-darwin` | Mach-O 64，arm64 | `LC_BUILD_VERSION`：minos 11.0，SDK 15.5 | `/usr/lib/libiconv.2.dylib`、`/usr/lib/libSystem.B.dylib` |
| `x86_64-apple-darwin` | Mach-O 64，x86_64 | `LC_VERSION_MIN_MACOSX`：10.12，SDK 15.5 | 同上 |
| `x86_64-unknown-linux-gnu` | ELF64，小端 x86_64 | 最高必需 GLIBC 版本 2.34；另需 GCC 符号版本 3.0、3.3、4.2.0 | `libgcc_s.so.1`、`libc.so.6`、`ld-linux-x86-64.so.2` |
| `aarch64-unknown-linux-gnu` | ELF64，小端 AArch64 | 最高必需 GLIBC 版本 2.34；另需 GCC 符号版本 3.0、3.3、4.2.0 | `libgcc_s.so.1`、`libc.so.6` |
| `x86_64-unknown-linux-musl` | ELF64，小端 x86_64 | 没有 `GLIBC_*` 版本引用；不能据此推导最低 musl 版本 | `libc.so` |
| `aarch64-unknown-linux-musl` | ELF64，小端 AArch64 | 同上 | `libc.so` |
| `x86_64-pc-windows-msvc` | PE32+ DLL，x86_64 | PE OS／Subsystem 6.0；Linker 14.51 | Windows 系统 DLL、VC Runtime、UCRT，详见下文 |
| `aarch64-pc-windows-msvc` | PE32+ DLL，AArch64 | PE OS／Subsystem 6.2；Linker 14.44 | 同上，UCRT 导入集合略有不同 |

### Linux GNU

两个 GNU 产物均有下列非弱、未定义动态符号引用：

| 版本 | 符号 |
| --- | --- |
| `GLIBC_2.34` | `pthread_key_create`、`pthread_key_delete`、`pthread_setspecific` |
| `GLIBC_2.33` | `stat64`、`fstat64` |

`gettid@GLIBC_2.30` 与 `statx@GLIBC_2.28` 是弱引用，不能将它们与上述必需符号混为一谈。2.34 的判断同时由版本需求表与动态符号表确认。`GCC_4.2.0` 等是 `libgcc_s` 的符号版本名称，不是要求用户安装该版本的 GCC 编译器。

两个 GNU 文件均未声明 RPATH／RUNPATH；依赖由实际宿主的动态加载环境提供。没有直接 `libstdc++.so.6` 依赖，不代表 Node 或系统库的间接依赖也不存在。

Node v24.21.0 的平台表对 GNU x64／arm64 列出 glibc 2.28、内核 4.18 条件；本批 addon 的 2.34 要求更高。当前 Ubuntu 24.04 上的成功验收不证明 glibc 2.28 或 2.34 边界环境成功。[Node 24 平台与官方构建环境](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#platform-list)

### Linux musl

两个产物的 `DT_NEEDED` 均只有 `libc.so`，没有 `libgcc_s.so.1` 或 glibc SONAME，没有 RPATH／RUNPATH，也没有 GLIBC 符号版本记录。动态符号仍引用 libc 的内存分配、线程、文件和加载器接口，因此不能称为无需 libc 的静态产物。

当前证据来自对应 CPU 的 `node:24.21.0-alpine3.23` 安装与加载测试。未在旧 Alpine／musl 版本实测，不能套用 Node 平台表中另一个架构或早期 musl 的数字；也不能从未版本化符号表反推出准确最低版本。

### macOS

两份产物仅以 `LC_LOAD_DYLIB` 引用表中两个系统库，未发现 `LC_RPATH`。`LC_ID_DYLIB` 中还保留 CI 构建目录下的自身 install name；它不是要求消费端加载的第三个依赖，本轮没有改写它。

Apple 将 `minos`／`version_min_command.version` 定义为构建时声明的最低运行系统，`sdk` 则记录 SDK 版本，两者不能互换。[Mach-O 定义](https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h)

Node v24.21.0 的 macOS x64／arm64 条件为 13.5；addon 的 10.12／11.0 标记不能降低这个条件。本批在 macOS 15 runner 上运行成功，尚无 macOS 13.5 的实际消费端证据。Node 文档还排除供应商已停止支持的系统版本，因此表列数字也不是对所有旧系统的当前支持承诺。[Node 官方平台及二进制说明](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#official-binary-platforms-and-toolchains)

### Windows

按 DLL 名称大小写不敏感去重，两份产物共同导入：

- `KERNEL32.dll`
- `api-ms-win-core-synch-l1-2-0.dll`
- `bcryptprimitives.dll`
- `ntdll.dll`
- `VCRUNTIME140.dll`
- `api-ms-win-crt-runtime-l1-1-0.dll`
- `api-ms-win-crt-heap-l1-1-0.dll`

x64 另外导入 `api-ms-win-crt-math-l1-1-0.dll` 中的 `trunc`。两份产物的 Delay Import Directory 均为空；普通导入包括 `WaitOnAddress`、`WakeByAddressAll`、`WakeByAddressSingle`、`ProcessPrng`、`NtWriteFile`、`RtlNtStatusToDosError` 等系统接口，以及 VC Runtime 的异常处理和内存函数。API-set 名称不等于要求包中附带同名实体 DLL。

PE OS／Subsystem 字段只是一部分条件；不能据 6.0／6.2 宣称支持 Windows Vista／8，也不能从 `VCRUNTIME140.dll` 的名字或 Linker 版本推出准确最低再发行组件版本。需在同架构、无 Visual Studio 等开发工具的干净环境中，验证所选 Node 安装方式能提供所需运行库和系统 API。[PE 字段与导入表](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)

当前 x64 证据来自 Windows Server 2025 runner，arm64 来自 Windows 11 runner。没有 Windows 10／Server 2016 的实际测试；Node 文档中的这些数字不是本批 addon 的已验证下限。[Node 平台表](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md#platform-list)

## 文件身份

以下哈希均为实际重新计算的 SHA-256，不只是抄录清单。对应 tarball 为 `<Rust target>.tgz`；完整原始清单仍为下载产物中的 `batch.json`。

| Rust target | `.node` 字节数 | `.node` SHA-256 |
| --- | ---: | --- |
| `aarch64-apple-darwin` | 724432 | `62f0b5975ad3ea649c7a641b30ab17002fe66d427581f038ff63352b7589730a` |
| `x86_64-apple-darwin` | 740960 | `dd3a668d4c08119e83b1c602e9bb14a8e52827b1112b342dbecbb5e5194c3065` |
| `aarch64-pc-windows-msvc` | 454144 | `9f51f2e2dab7029fdf381b421636accf26a15e4562a475b5275558a3cd43ab02` |
| `x86_64-pc-windows-msvc` | 514560 | `26ed7f221e3c5496cc9cf61fc22cd82025b00c0eaf5399b16e41d5253d59be6a` |
| `x86_64-unknown-linux-gnu` | 860248 | `8f4e6c902e5e964ee278f74fd6657b8f3a10b6e5f98461dfcf0b4e9b25ab77ab` |
| `aarch64-unknown-linux-gnu` | 876448 | `58c0e6f4487c3cbce5d35a25e5fe1b96ae444199be86b5929406e13fe8b01258` |
| `x86_64-unknown-linux-musl` | 649784 | `ff2f14f123bcf796f318db6c0416f4170f109db7c53222b9a215fcb5c20b962a` |
| `aarch64-unknown-linux-musl` | 586384 | `dd7bd66ca7f3f20f8850eb8be23a7f7e35b5ca2d4901b9400200295516a4a9b8` |

主包 `ziwei.tgz` 为 19429 字节，SHA-256 为 `35af121e23971311d1433e523e3f55807c357ff406a8184eb5315b6c39590b2a`。Actions 产物会按工作流期限过期；过期后不能用另一次构建冒充本批字节。

## 复核方法

先下载上述 run 的 `node-distribution-1` 到一个新目录，并校验 `batch.json`。以下是在仓库根目录、使用本机 LLVM 工具的复核命令；`audit_dir` 是此次实际下载目录，可替换为同批产物的新位置。二进制基名与本次归档一致，不从未经检查的字符串构造 shell 命令。

```sh
audit_dir="target/node-compat-34454666959.vDgpYj/ziwei-fjnXe4"

# ELF 动态依赖与版本需求；另外检查 dynamic-syms 区分强／弱引用。
rtk proxy tar -xOzf "$audit_dir/x86_64-unknown-linux-gnu.tgz" package/ziwei-native.linux-x64-gnu.node | rtk proxy objdump --private-headers --dynamic-syms -

# Mach-O：只把 LC_LOAD_* 视为加载依赖，区分 LC_ID_DYLIB。
rtk proxy tar -xOzf "$audit_dir/aarch64-apple-darwin.tgz" package/ziwei-native.darwin-arm64.node | rtk proxy objdump --macho --private-headers --dylibs-used --rpaths -

# PE：检查可选头、普通导入及 delay import。
rtk proxy tar -xOzf "$audit_dir/x86_64-pc-windows-msvc.tgz" package/ziwei-native.win32-x64-msvc.node | rtk proxy objdump --file-headers --private-headers -
```

本次工具为 LLVM objdump；其他同名工具的参数未在此承诺兼容。归档条目只送到 stdout，不执行 `.node`，也不改写已测试文件。

## 后续决策与尚未验证的内容

静态审计之后，用户已确认 D-266：以 glibc 2.28 作为 GNU 验收目标。后续构建与双层门禁见 [GNU glibc 2.28 验收目标](../architecture/node-distribution-proposal.md#gnu-glibc-228-验收目标)。本文仍只记录旧批次的静态事实，不能把它作为新工具链或 glibc 2.28 运行通过的证据。

后续已补齐 macOS 双架构、Windows 双架构与 musl 双架构的最低 Node 消费验收，具体环境和未覆盖范围见[当前分发结论](../architecture/node-distribution-proposal.md#首批兼容性验收总览)。这些结果属于后续批次，不改写本文历史数据；容器仍共享宿主内核，不能单独证明最低内核版本。

本次没有验证最低内核、完整 CPU 指令集下限、递归依赖闭包、运行时动态加载的全部路径或旧系统行为，也没有证明 npm scope 权限、公开发布或 provenance。静态审计完成，不等于这些剩余事项已完成。
