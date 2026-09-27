# @matharts/ziwei 包约束

## 当前架构

- 完整排盘领域逻辑由本包的 TypeScript 实现。Node.js 与浏览器使用相同包根入口和同步 API；Rust 与 Wasm 不属于本包运行时依赖。
- 领域计算放在 `src/engine/`；`src/index.ts`、`src/natal.ts` 将内部实现适配为公开 API。内部引擎模块不作为包子路径导出。
- 公开行为及值合同遵循[Node API 设计](../../docs/architecture/node-api-design.md)，包括输入校验顺序、中文错误消息及结构化 detail、稳定枚举身份、脱离命盘的深层冻结 DTO，以及仅缓存每个命盘实例的 `profile` 和 `palaces`。
- 构建单份 ESM 包，只提供根导出。受支持的 Node 版本应保留 `require(ESM)` 兼容性。公开依赖图不得要求 top-level await 或仅供 Node 使用的内建模块，以便浏览器导入相同入口。
- `dist/` 是生成目录，不手工编辑或提交。构建从 TypeScript 产出 JavaScript 和声明，不要求消费者直接执行工作区源码。

## 迁移历史

- 旧包曾使用 Rust Node-API 绑定、外置 `native/binding.cjs`／`.node` 加载器和按平台分发，这些路径已从当前包移除。`@matharts/ziwei-shared` 仍被 TypeScript 包用于共享输入、校验、错误与投影逻辑；后续维护不得把它误判为废弃的原生专属依赖。
- 旧运行路径已切换。Node 与浏览器消费路径共用当前 TypeScript 包根入口；共享 conformance 覆盖与验收状态见[实现状态表](../../docs/architecture/implementations.md)，无需为兼容历史原生分发恢复旧运行路径。

## 工具链与验证

- 依赖版本统一由根 `pnpm-workspace.yaml` 的 Catalog 管理，本包 manifest 使用 `catalog:`，不重复声明版本。
- 根 `package.json` 的 `devEngines` 与 mise 配置负责开发工具版本。`engines.node` 只声明消费者最低 Node 版本，不重复开发约束，也不添加包内 scripts。
- 仓库开发任务定义在根 `mise.toml`，通过 `mise run` 执行。命令与范围遵循[工程验证](../../docs/agents/engineering.md)。
- 包测试应覆盖独立手算领域例及真实 Node／浏览器消费。Rust 输出只能作补充差分证据，不能作为 TypeScript 引擎的唯一预期。
- 修改历法或排盘语义时，遵循[领域规则](../../docs/agents/domain.md)适用章节。示例与公开 API 文档应和已实现行为一致。

## 发布

- 未获单独授权时保持 `private`。本地构建或测试通过，只能证明实际运行的环境与范围。
