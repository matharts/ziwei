# 工程验证

## 工具链与检查入口

Rust 命令通过 `mise` 执行：直接调用使用 `rtk mise exec -- <command>`，仓库任务使用 `rtk mise run <task>`。工具链版本和任务以 [mise.toml](../../mise.toml) 为准，MSRV 以适用的 Cargo manifest 为准；验证 MSRV 使用仓库对应任务。

开始验证前，按变更范围读取 [CI 配置](../../.github/workflows/ci.yml)、[Git 钩子](../../lefthook.yml) 和相关 Cargo manifest，确定适用检查及参数。本地钩子只覆盖部分检查，钩子通过不能代替完整 CI 结果。

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
