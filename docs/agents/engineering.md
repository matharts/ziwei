# 工程验证

## 工具链与检查入口

Rust 命令通过 `mise` 执行：直接调用使用 `rtk mise exec -- <command>`，仓库任务使用 `rtk mise run <task>`。工具链版本和任务以 [mise.toml](../../mise.toml) 为准，MSRV 以适用的 Cargo manifest 为准；验证 MSRV 使用仓库对应任务。

开始验证前，按变更范围读取 [CI 配置](../../.github/workflows/ci.yml)、[Git 钩子](../../lefthook.yml) 和相关 Cargo manifest，确定适用检查及参数。本地钩子只覆盖部分检查，钩子通过不能代替完整 CI 结果。

Node 开发从仓库根使用 `mise run build:node`、`mise run check:node`，或根目录的 `pnpm run build`／`test`／`test:types`。这些入口均先通过 `mise exec -- node` 选择项目版本，再调用 [Node 任务执行器](../../tools/node/run.mjs)；执行器只转发 `packages/core/package.json` 中的既有任务，在子进程 PATH 首位放置当前 Node 的目录，并保留 pnpm 的参数与退出码。项目 `mise.toml` 启用 `activate_aggressive`，确保工具目录即使已在 CI 的 PATH 中，也会重新置顶；不依赖交互式 shell 的激活记录。版本只由 mise 管理，不另设 pnpm 运行时版本，也不改全局 PATH。包内／`--filter @ziweijs/core` 脚本是底层入口，直接调用时仍由调用者管理运行环境。

根 `pnpm-workspace.yaml` 启用 `shellEmulator`，让脚本在 Windows 与 POSIX 使用同一套解析和参数转义规则；不能仅凭执行器未启用 `shell` 就推断 pnpm 的下一层不会解释参数。`mise run check:node:tools` 单独验证这些入口、PATH 遮蔽、有／无激活记录、嵌套子进程、含引号及元字符的参数转发和失败传播；Windows 路径比较使用原生 realpath 处理长短文件名。CI 在各平台的包测试前运行它，不触发性能测量。工具测试只信任自行创建的临时 mise 配置，不修改用户全局信任列表。[mise 的 PATH 优先级设置](https://mise.jdx.dev/configuration/settings.html#activate_aggressive)与 [pnpm 的 shellEmulator](https://pnpm.io/cli/run#shellemulator)是本实现采用的工具边界。

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
