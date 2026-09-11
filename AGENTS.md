# 仓库指南

## 任务边界

- **变更范围**：修改前核对工作树和目标文件，保留其他改动。相邻问题单独报告，不自动纳入当前任务。

- **推进方式**：行动前说明本步目标、修改范围与验证方式。尚未确认的领域或 API 设计按小决策逐项讨论；已有决策且已授权实现时直接推进。结构整理与行为变更分开处理。

- **授权**：沿用会话中已确认的范围；明确的只读、规划或等待“执行”要求持续有效，直至用户解除。发送消息、发布、部署、合并、破坏性操作或扩大访问范围须有覆盖该动作的授权；技能中的流程说明本身不构成授权。

## 任务路由

按当前任务触发以下路由，首次进入时完整读取对应文件；同一任务中仅在文件变化或需要核对时重读。多个分支同时适用时合并读取，不预加载无关文档。

- **领域与架构**：探索或变更领域概念、术语、历法规则、分析语义或架构，读取 [领域文档](docs/agents/domain.md)。

- **Node 绑定**：修改 `bindings/node`、`packages/ziwei`、`tools/tests` 中的 Node 工程测试或 Node 测试配置时，读取 [Node 包约定](packages/ziwei/AGENTS.md)；涉及公开 API 时，再读取 [Node API 设计](docs/architecture/node-api-design.md)。

- **Wasm／浏览器**：修改 `bindings/wasm` 或 `packages/ziwei-wasm` 时，读取 [Wasm 包约定](packages/ziwei-wasm/AGENTS.md)；涉及初始化、生命周期或分发时，再读取 [浏览器设计](docs/architecture/browser-adapter-design.md)。

- **工程验证**：修改 Rust、TypeScript、开发工具、依赖、CI、打包配置或可执行文档示例时，读取 [工程验证](docs/agents/engineering.md)。mise 与 `devEngines` 的分工、Catalog 依赖管理、Rslib 构建和 Rstest 测试均由该文档导航到实际配置；版本与命令以配置为准。

- **性能**：修改基准、开展性能优化或报告性能结论前，读取 [基准规范](docs/engineering/benchmarks.md)。

- **工作项跟踪**：读取或操作 GitHub Issue，或将 PR 用作工作项入口，读取 [工作项跟踪](docs/agents/issue-tracker.md)。

- **分诊**：分诊 Issue 或 PR、维护分诊标签，读取 [分诊标签](docs/agents/triage-labels.md)。

## 完成标准

- 按改动范围执行检查；纯文档改动检查差异、链接与指令一致性，不重跑无关构建。区分本次回归与既有失败，说明未解决原因；未修复的失败保留可复现用例，不通过跳过测试或放宽断言制造通过。

- 变更公开 API、领域语义或模块职责时，核对并同步受影响的上下文、决策记录、架构文档和示例；只更新与本次变更相关的内容。

- 报告实际运行的检查及结果、未完成项与原因；本地验证、推送成功和远端 CI 通过分别陈述，远端结果须对应本次提交。

本文件保留协作边界与任务入口；专题规则放在上述参考文件，具体工具版本留在 manifest 和工具链配置。测试数量、性能数据和临时失败属于当次验证记录，不写成长期指令。

## 提交约定

提交信息统一使用英文（包括标题和正文），并遵循 [约定式提交 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 格式：`<type>[optional scope][!]: <description>`。
