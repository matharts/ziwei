# Windows 干净消费环境研究

核查日期：2026-09-10。状态：二进制静态核查与方案研究；研究阶段没有运行 Windows 来宾测试、修改链接方式或 CI、创建云资源、发布包。后续获准实现的 x64 CI 实验见文末，仍未实机验收。下文将实测材料、官方事实、方案判断和待执行验收分开记录。

## 结论与当前边界

最新批次的 Windows x64、arm64 addon 均直接导入 `VCRUNTIME140.dll`；官方 Node `24.15.0`、`24.21.0` 双架构 ZIP 均不包含 DLL，所附 `node.exe` 的直接导入表也没有该依赖。因此，能启动 Node 不等于已满足 addon 的运行库依赖。这里确认的是静态依赖与安装材料之间的缺口，尚未在干净 Windows 上复现加载失败，不能据此宣布所有用户都必须手动安装运行库。

推荐用同架构的 Windows 11 x64／arm64 一次性 VM 验证同一批已封存 tarball。若已有符合要求的两种架构 Windows 实体机，Windows Sandbox 可先完成一次人工启动、脚本执行的验证。当前没有核实到能在仓库现有 GitHub-hosted runner 上直接提供、且有官方支持保证的双架构干净环境：Sandbox 涉及不受 GitHub 支持的嵌套虚拟化，已查 Windows 容器镜像只有 amd64，自定义 Windows runner 镜像当前也仅列 x64。具体证据见后文。

[当前 CI](../../.github/workflows/ci.yml) 的 Windows 消费端分别使用 `windows-2025` 和 `windows-11-arm`，在 runner 内直接执行注册表消费夹具。它们验证了实际平台消费，但环境仍包含 runner 预装软件。GitHub 当前镜像清单分别列有 Visual Studio Enterprise 与 Visual C++ Runtime；每次任务的准确清单应取其 `Set up job` 中的 `Included Software`，不能拿今天的 `main` 清单代替历史运行环境。[GitHub runner 说明](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners#preinstalled-software-for-github-owned-images)、[Windows Server 2025 镜像清单](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-VS2026-Readme.md)、[Windows 11 arm64 镜像清单](https://github.com/actions/runner-images/blob/main/images/windows/Windows11-Arm64-Readme.md)

这里的“干净”指可重建的系统基线、已记录的预装软件与运行库、明确的 Node 安装步骤。它不等于“所有 CRT DLL 都不存在”：UCRT 是 Windows 10+／Windows Server 2016+ 的系统组件。验收保留系统提供的文件，用新实例或还原基线复现初始状态。[Microsoft UCRT 部署说明](https://learn.microsoft.com/en-us/cpp/windows/universal-crt-deployment?view=msvc-170)

## 本次产物与 Node 安装材料

### 最新同批 Windows addon

取自提交 `e6895359e541e023d00aa1f13f238704d0171165` 的 [CI 34492050979](https://github.com/matharts/ziwei/actions/runs/34492050979)，attempt `1`，artifact `node-distribution-1`，artifact ID `10158311889`。下载后重新计算了 `batch.json` 所列全部 9 个 tarball 的字节数与 SHA-256，均一致；以下两份 `.node` 还分别核对了 `binaryDigest`，没有消费端重编译。

| 目标 | `.node` 字节数 | `.node` SHA-256 |
| --- | ---: | --- |
| `x86_64-pc-windows-msvc` | 514560 | `4e12739698a67428312f75dd9a2ba519b0a00109d4cc1fba500bd780740415b1` |
| `aarch64-pc-windows-msvc` | 454144 | `073081c39a30c8ab008d503c2f27dd2c5b36b2ce0ccb2b5b0bcf53eb6a5b16e4` |

用 macOS LLVM `objdump` 检查封存 tarball 内的 PE 文件，确认架构分别为 x86-64、AArch64。按大小写不敏感去重后的共同直接导入项为：

```text
kernel32.dll
api-ms-win-core-synch-l1-2-0.dll
bcryptprimitives.dll
ntdll.dll
VCRUNTIME140.dll
api-ms-win-crt-runtime-l1-1-0.dll
api-ms-win-crt-heap-l1-1-0.dll
```

x64 还导入 `api-ms-win-crt-math-l1-1-0.dll`；两份文件的 delay-import directory 均为空。本次没有递归审计所有系统 DLL，也没有执行动态加载路径。API-set 名称不能直接当作必须随包复制的实体 DLL 清单；PE subsystem 或 linker 版本也不能单独证明最低 Windows／Redistributable 版本。[Microsoft DLL 搜索说明](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order)

这是一份新批次核查，不能覆盖或改写 [既有二进制兼容性记录](node-binary-compatibility.md) 中对应旧提交的摘要与结论。Node-API 的 ABI 兼容承诺也不代替操作系统与运行库验收。[napi-rs 支持边界](https://napi.rs/docs/more/support-compatibility)

### 官方 Node ZIP

从 `nodejs.org/dist` 下载项目最低版本 `24.15.0` 与开发版本 `24.21.0` 的 Windows x64／arm64 ZIP，逐一核对官方 `SHASUMS256.txt`。四份均通过；这只是与官方清单的摘要一致性核对，不是 Authenticode 或清单签名验证。[24.15.0 清单](https://nodejs.org/dist/v24.15.0/SHASUMS256.txt)、[24.21.0 清单](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt)

| ZIP | SHA-256 |
| --- | --- |
| `node-v24.15.0-win-x64.zip` | `cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62` |
| `node-v24.15.0-win-arm64.zip` | `c9eb7402eda26e2ba7e44b6727fc85a8de56c5095b1f71ebd3062892211aa116` |
| `node-v24.21.0-win-x64.zip` | `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541` |
| `node-v24.21.0-win-arm64.zip` | `8779b1bde1d39f8d420e3b57aa657b39891af434d3de44a919044cec06785921` |

四份 ZIP 的条目清单都没有 `.dll` 文件；四份 `node.exe` 的直接导入集相同，为 `crypt32.dll`、`ws2_32.dll`、`user32.dll`、`dbghelp.dll`、`advapi32.dll`、`iphlpapi.dll`、`userenv.dll`、`shell32.dll`、`ole32.dll`、`winmm.dll`、`kernel32.dll`，不含 `VCRUNTIME140.dll`。此结论限于所查 ZIP 和直接导入表，不声称所有传递依赖或动态加载路径均已审计。

Node `v24.15.0` 的构建配置也将非 shared 的 Release 构建设为 `MultiThreaded (/MT)`，与 Node 主程序及独立 addon 的 CRT 依赖不同这一现象相符；不能把主程序的链接方式推广到所有 addon。[对应版本的 common.gypi](https://github.com/nodejs/node/blob/v24.15.0/common.gypi)

### MSI 与运行库来源

本次仅检查两个 Node 版本的 `tools/msvs/msi/nodemsi/product.wxs` 源码，未下载、安装或执行 MSI。两版该文件字节相同；文件内未发现 VC Redistributable 安装组件的引用。原生开发工具安装由 `NATIVETOOLSCHECKBOX = 1` 条件触发，执行 `install_tools.bat`，后者说明会安装 Python 和 Visual Studio Build Tools。这是开发工具安装选项，不应作为“仅安装 Node”的干净基线；源码核查也不能替代实际 MSI 安装前后的文件／注册表差异记录。[24.15.0 MSI 源码](https://github.com/nodejs/node/blob/v24.15.0/tools/msvs/msi/nodemsi/product.wxs)、[24.21.0 MSI 源码](https://github.com/nodejs/node/blob/v24.21.0/tools/msvs/msi/nodemsi/product.wxs)、[开发工具脚本](https://github.com/nodejs/node/blob/v24.15.0/tools/msvs/install_tools/install_tools.bat)

运行库按来源分开记录：

- **UCRT**：Microsoft 将其作为较新 Windows 的系统组件交付，不能与 `VCRUNTIME140.dll` 混为一类，也不删除系统文件制造负例。[UCRT 部署说明](https://learn.microsoft.com/en-us/cpp/windows/universal-crt-deployment?view=msvc-170)
- **VC Runtime**：若干净环境缺失所需运行库，将安装 Microsoft 官方 Visual C++ v14 Redistributable 作为独立实验条件。记录架构、安装器版本／摘要、安装后 DLL 路径与版本；Microsoft 要求运行库版本不低于应用所用 MSVC Build Tools 的版本。本次未从 PE linker 字段推定精确最低版本。[官方 Redistributable 下载与版本要求](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)

清空 `PATH` 不是干净环境证明：Windows 搜索还涉及已加载模块、Known DLLs、系统目录等来源。最终应记录实际加载模块路径；负例从未被额外安装污染的基线产生，不卸载 runner 的开发工具或删除共享 DLL。[Microsoft DLL 搜索顺序](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order)

## 可选环境

| 方案 | 能覆盖的目标与收益 | 限制及适合的用途 |
| --- | --- | --- |
| Windows Sandbox | AMD64；Windows 11 22H2+ 的 Arm64。每次启动恢复干净实例，宿主安装的软件不会直接进入 Sandbox | 需要受支持的 Windows 客户端版本与硬件虚拟化；系统版本跟随宿主，不适合固定历史系统基线；适合已有两种实体机时的首轮验收 |
| Windows Server Core 容器 | 已查 LTSC 2022／2025 镜像为 amd64；固定 digest 后容易重建，能与宿主开发软件隔离 | 不提供已核实的 arm64 镜像；必须满足 Windows 宿主与镜像兼容矩阵；只能证明具体 Server Core 环境，不能代替 Windows 11 或最低系统验收 |
| 同架构 Windows 11 一次性 VM | x64 与 arm64 各自使用对应镜像和真实架构宿主；可固定镜像、更新水平并从基线生成新实例 | 需要两个架构的计算资源、Windows 使用权、实例回收与结果保存；最适合完整、可复用的双架构验收 |
| GitHub larger runner 自定义镜像 | 官方允许从干净 OS base image 开始，Windows 当前列 x64 | 需要组织／企业的相应计划、runner 管理和计费设置；当前官方支持平台没有 Windows ARM64，不能单独补全本任务 |

### Windows Sandbox

**官方事实。** Sandbox 支持 Windows 10 1903+／Windows 11；AMD64 可用，Arm64 要求 Windows 11 22H2+。支持版本包括 Pro、Enterprise、Education 等，Home 不支持；官方适用系统未包含 Windows Server。最低资源要求为 4 GB RAM、1 GB 空闲磁盘、两个 CPU 核心，并启用硬件虚拟化。在 VM 内运行 Sandbox 还必须由宿主提供嵌套虚拟化，启用功能可能要求重启。[安装条件](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install)、[版本与许可范围](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)

官方 `.wsb` 配置支持只读／可写映射目录、启动命令和网络开关。可将输入 tarball、已核验的 Node 安装材料和脚本映射为只读，用单独目录接收报告；测试仍在 Sandbox 内部工作目录完成。关闭 Sandbox 后其中的软件和状态被丢弃；同一次实例内重启与重新开启实例是不同操作。[配置说明](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)、[实例生命周期](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)

Sandbox 只允许使用与宿主相同的 OS build；它不能像独立 VM 那样选择另一历史系统镜像。因此要固定基线，必须同时记录和控制宿主更新。[Microsoft Sandbox FAQ](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-faq#how-can-i-open-windows-sandbox-with-a-different-os-version)

**方案判断。** `windows-2025` 是 Windows Server 2025，不能按受支持的 Sandbox 客户端环境设计。`windows-11-arm` 的系统类别可以满足 Sandbox 条件，但 GitHub 明确将 hosted runner 内的嵌套 VM 视为实验性使用，不保证稳定性、性能或兼容性。因此不能仅因能启用可选功能就承诺它是可靠门禁；本次也没有执行启用、重启或嵌套 VM 探测。[runner 系统对应关系](https://github.com/actions/runner-images#available-images)、[GitHub 对嵌套虚拟化的限制](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners#runner-images)

### Windows 容器

**官方事实。** Windows 容器需要受支持的 Windows 宿主及容器运行时。process isolation 隔离文件系统与注册表，但共享宿主内核；Hyper-V isolation 使用独立内核，在 VM 宿主内使用时需要嵌套虚拟化。官方兼容表允许 Server 2025 宿主以 process isolation 运行 Server 2025 或 Server 2022 镜像；不能将任意宿主／镜像版本混用。[宿主要求](https://learn.microsoft.com/en-us/virtualization/windowscontainers/deploy-containers/system-requirements)、[隔离方式](https://learn.microsoft.com/en-us/virtualization/windowscontainers/manage-containers/hyperv-container)、[兼容矩阵](https://learn.microsoft.com/en-us/virtualization/windowscontainers/deploy-containers/version-compatibility)

本次只读取 Microsoft Container Registry 的 manifest 元数据，没有拉取或运行镜像。以下三个 tag 返回的清单均只有一个 `windows/amd64` 项，没有 `windows/arm64`：

| 镜像 | 清单 digest | 清单中的 OS 版本 |
| --- | --- | --- |
| [servercore:ltsc2025](https://mcr.microsoft.com/v2/windows/servercore/manifests/ltsc2025) | `sha256:e18a49cbc074dfaa8e106296d51cebd62bbf6effb999f134a5c48eed1c2334e1` | `10.0.26100.33438` |
| [servercore:ltsc2022](https://mcr.microsoft.com/v2/windows/servercore/manifests/ltsc2022) | `sha256:76cf422c98ca437b308374d0498280541fa42ac7061bb44015a6c8b70cf4db6a` | `10.0.20348.5622` |
| [nanoserver:ltsc2025](https://mcr.microsoft.com/v2/windows/nanoserver/manifests/ltsc2025) | `sha256:15760261db306980fd96acf7e2c73779eaaeefdff289339b9526295c88957e56` | `10.0.26100.33438` |

这是所查正式镜像的当前证据，不将其扩大为“Microsoft 永远不可能提供 Windows arm64 容器”。这些 amd64 镜像不能承担原生 Windows arm64 Node／addon 的验收；`--platform` 选择器本身不会提供缺失的镜像或 CPU 执行环境。

**方案判断。** 可将 `windows-2025` 加固定 digest 的 Server Core、process isolation 作为 x64 增补方案，首次实施仍需实测 Docker daemon、镜像拉取、磁盘及耗时。基线应从 Microsoft OS 镜像加消费所需材料组成，不选带开发工具链的镜像，也不挂载宿主工具链目录。Server Core 自带的 API／组件不同于 Windows 11；Nano Server 又缺少 PowerShell、WMI 和 servicing stack，因此“更小”不代表更合适。基线内是否已有本次 addon 所需 DLL 必须记录，镜像名字和没有 Visual Studio 都不能回答这一点。[Microsoft 基础镜像差异](https://learn.microsoft.com/en-us/virtualization/windowscontainers/manage-containers/container-base-images)

通过容器测试最多证明“这些 tarball 能在记录的 Server Core 镜像、宿主内核、Node 安装方式下运行”。不能据此推出 Windows 11 全面兼容、arm64 兼容、没有动态运行库依赖，或某一 Windows 最低版本。

### 同架构 Windows 11 一次性 VM

**官方事实。** Microsoft 提供 Windows 11 Arm64 ISO，可在 Windows 11 Arm 设备上通过 Hyper-V 创建 Arm64 VM；x64 硬件上的 Hyper-V 不支持 Arm64 VM。官方也列有 Apple Silicon 上运行 Windows 11 Arm VM 的路径；这不构成将 x64 仿真结果计作原生 x64 验收的依据。[Arm ISO 与虚拟机路径](https://learn.microsoft.com/en-us/windows/arm/iso)

Windows 11 VM 的一般要求包括 Generation 2、至少两个 vCPU、4 GB RAM、64 GB 磁盘、Secure Boot 与虚拟 TPM；还需满足所选宿主的兼容要求。Apple Silicon 路线要核对适用虚拟化产品、芯片和 Windows 实例许可。直接在来宾中测试 Node 不需要再套一层 Sandbox。[Windows 11 VM 要求](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements#virtual-machine-support)、[Microsoft 的 Mac 虚拟化说明](https://support.microsoft.com/en-us/windows/options-for-using-windows-11-with-mac-computers-with-apple-m1-m2-and-m3-chips-cd15fd62-9b34-4b78-b0bc-121baa3c568c)

Azure 是另一条 Arm64 资源路径，Microsoft 的 Windows on Arm VM quickstart 目前仍标注 Preview，并要求订阅及适用的 Windows 使用权。它与较新的通用 VM 要求对安全类型的表述并不完全一致，因此云方案要按实际可选镜像、SKU、区域、配额和适用要求再次核实，不能从文档推定本账户已能创建稳定实例。[Azure Arm64 VM quickstart](https://learn.microsoft.com/en-us/windows/arm/create-arm-vm)

**方案判断。** 为 x64／arm64 分别建立没有额外开发软件的系统基线，每轮从基线克隆或还原，只输入已封存包和明确列出的消费工具。系统更新改变基线时重新编号。要自动接入 CI，可由外部控制器管理来宾，或给一次性 VM 注册 ephemeral self-hosted runner。GitHub 当前自托管架构表列有 Windows x64 与 ARM64，后者标注 public preview；runner 还需要出站 HTTPS。`--ephemeral` 只保证接一个 job 后注销，VM／磁盘重置和外部日志保存仍由环境管理方负责。[自托管 runner 支持与生命周期](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)

如果 runner 安装在来宾里，必须把其引导过程和依赖纳入基线清单；不以“runner 没安装 Visual Studio”代替 DLL 状态核查。首轮也可直接启动消费脚本、导出结果，以便先证明干净环境行为，再单独设计 CI 接入。

### GitHub 自定义镜像的补充边界

GitHub larger runner 的自定义镜像可从干净 OS base image 生成，但当前文档明确列出的平台是 Linux x64、Linux ARM64、Windows x64。该能力需要相应组织／企业计划与管理权限；它不是现有标准 runner 的一个免费 YAML 开关，也不能按当前文档补全 Windows ARM64。[自定义镜像支持平台与配置](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/use-custom-images)、[larger runner 与镜像计费范围](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners#custom-images)

## 推荐最小验收路径（待执行）

1. **固定输入。** 选择一个完整批次，保存 `batch.json`、tarball 摘要及对应提交／run／attempt；消费端不重编译 addon。沿用项目 Node 最低版本 `24.15.0` 与开发版本 `24.21.0` 的职责，首轮至少验证最低版本；具体安装材料须与后续实际二进制核查一致。
2. **提供真实双架构基线。** 首选各一台同架构 Windows 11 VM；若已有符合 Sandbox 条件的实体机，可先在两台机器的全新 Sandbox 实例中完成同样流程。记录系统版本、build、更新、原生 CPU／OS 架构和镜像来源，不在此阶段认定最低 Windows 版本。
3. **分开安装路径。** 首轮用最低版本官方 Node ZIP，不安装开发工具；若需要单独安装 VC Redistributable，作为另一个明确的消费条件。每种条件使用新实例。先记录初始 DLL／已装软件，再记录安装后的变化，避免前一轮安装影响后一轮。开发版本 ZIP 与 MSI 的约定安装选项后续分别验收，不从 ZIP 结果推定 MSI 行为。
4. **验证真实加载。** 核对 Node `process.arch` 与 OS 原生架构一致，在独立消费目录复用现有 npm／pnpm 注册表消费合同，确认包筛选、ESM／require、Worker 和真实 `.node` 加载。报告 Node 路径与版本、实际加载 DLL 的路径／版本、全部退出码；仅 npm 安装成功不能算 addon 验收完成。
5. **保留可复查报告。** 保存环境、材料摘要、每种安装条件和测试结果；关闭 Sandbox 或回收本次 VM 后，下一轮再次从同一基线开始。首轮通过后再讨论自动化接入；x64 Server Core 可独立补充，但不代替 Arm64 VM 结果。

## 外部环境与授权缺口

本次没有核实可使用的 Windows x64／arm64 实体机、虚拟化宿主或云资源，没有 Windows 实例使用权、Azure 订阅／配额、GitHub 自托管 runner 注册或 larger runner 计费配置的授权证据。确定上述资源后才能实施相应路线。现在可交付的是受官方资料支持的环境方案与待验收边界，不能报告干净 Windows 双架构已通过。

本机 `/Applications` 中未发现 Parallels Desktop、UTM、VMware Fusion、VirtualBox；这是常见应用路径的有限检查，不代表已穷尽其他安装位置或远端资源。

研究阶段的授权仅覆盖只读核查与方案文档；创建实例、安装软件、注册 runner、修改 CI／链接方式、提交推送及发布均未在该阶段执行。

本次验证限于封存 tarball／二进制摘要、PE 直接导入、Node ZIP 摘要与条目、官方资料以及本文差异／链接检查。纯研究记录未重跑 Rust／Node 构建与测试。

## 后续：Windows x64 CI 实验

用户随后授权先实现 x64 容器 CI 验收，不要求本机安装虚拟机。[实验工具](../../packages/ziwei/tools/windows-container.ts)和[工作流](../../.github/workflows/ci.yml)已接入固定 digest 的 Server Core、官方最低 Node ZIP、同批 tarball 消费与失败证据保存；未改 CRT 链接方式，未自动安装 VC Redistributable，未扩展 arm64 环境或发布。

首次运行 [34497803586](https://github.com/matharts/ziwei/actions/runs/34497803586)（提交 `9455a3c`、attempt 1）已启动固定 Server Core 镜像和 Node 24.15.0，但 `pnpm.exe --version` 以 `3221225781`（`0xC0000135`）退出。`consumer.json` 的 `consumers` 为空：当时公共 pnpm 前置检查早于 npm 验收，失败发生在任何 Ziwei 导入之前。不能把这次失败归为 Ziwei 原生模块加载失败。

该批 pnpm 12.3.4 二进制的 SHA-256 为 `19acb40343170a98e3c610c1c2c379d0a6f0721ea6c4dd6d1737429fad63a12e`，与官方包提取结果相同；其 PE 导入包含 `VCRUNTIME140.dll`。容器记录的 System32 清单只有 `_clr0400` 变体及 UCRT，没有同名的 `VCRUNTIME140.dll`。这与缺失运行库的启动错误一致，但尚未通过补充运行库的对照实验验证，不调整链接方案。

后续修复将 npm／pnpm 验收隔离：先完成 npm 分支，再准备并检查 pnpm；每个分支单独记录阶段、结果和错误，任一失败仍使 CI 失败。修复已补本地真实消费端回归，尚待新提交的 Windows CI 实测。详细操作与证据边界见 [Windows x64 容器实验](../architecture/node-distribution-proposal.md#windows-x64-干净容器实验待远端验收)。
