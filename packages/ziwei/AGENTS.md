# @matharts/ziwei 包约束

## 当前架构

- 完整排盘领域逻辑由本包从零实现为 TypeScript。Node.js 与浏览器使用相同包根入口和同步 API；Rust 与 Wasm 不属于本包运行时依赖。
- `src/domain/` 定义领域身份、公开类型、错误、输入校验及宫干与五行局规则；`src/chart/` 定义本命事实和公开命盘句柄；`src/stars/` 拥有星曜目录、落宫布局、共享星曜值与四化；`src/palaces/` 拥有宫职目录、宫位物化和期间布局。`src/index.ts` 是唯一公开入口，不提供内部子路径或内部汇总入口。
- 模块依赖方向为 `chart → palaces → stars → domain`；同层模块可以直接依赖 `domain`，`chart` 负责组合规则及延迟查询，领域规则和数据不反向依赖命盘句柄。目录和落宫规则不依赖值缓存。两种建盘入口各自构造类型完整的公开档案；`chart/facts.ts` 在建盘时一次确定星曜布局序号，后续模块只使用该布局事实。
- `domain/identities.ts` 只定义身份常量和索引；身份转换及其参数校验在 `domain/identity-queries.ts`。`domain/errors.ts` 定义公开异常，`domain/constraints.ts` 提供内部基础约束，避免领域数据依赖错误处理。
- `domain/inputs.ts` 只提供两种建盘输入的安全捕获与校验；`domain/validation.ts` 校验查询参数。捕获字段、输入顺序和错误细节属于公开行为，不因模块整理而改变。
- 公开 API 以[TypeScript API](../../docs/architecture/typescript-api.md)为准，逐项覆盖 Rust crate 的公开领域能力。旧 [Node API 设计](../../docs/architecture/node-api-design.md) 仅为历史资料，不是当前 TS 对象形状的合同。
- 构建单份 ESM 包，只提供根导出。受支持的 Node 版本应保留 `require(ESM)` 兼容性。公开依赖图不得要求 top-level await 或仅供 Node 使用的内建模块，以便浏览器导入相同入口。
- `dist/` 是生成目录，不手工编辑或提交。构建从 TypeScript 产出 JavaScript 和声明，不要求消费者直接执行工作区源码。

## 迁移历史

- 旧包的 Rust Node-API 绑定、Wasm 包、共享投影包和旧 Node 门面均已退役；不要恢复它们的运行路径。Node 与浏览器消费同一 TypeScript 包根入口；共享 conformance 覆盖与验收状态见[实现状态表](../../docs/architecture/implementations.md)。

## 工具链与验证

- 依赖版本统一由根 `pnpm-workspace.yaml` 的 Catalog 管理，本包 manifest 使用 `catalog:`，不重复声明版本。
- 根 `package.json` 的 `devEngines` 与 mise 配置负责开发工具版本。`engines.node` 只声明消费者最低 Node 版本，不重复开发约束，也不添加包内 scripts。
- 仓库开发任务定义在根 `mise.toml`，通过 `mise run` 执行。命令与范围遵循[工程验证](../../docs/agents/engineering.md)。
- 包测试应覆盖独立手算领域例及真实 Node／浏览器消费。Rust 输出只能作补充差分证据，不能作为 TypeScript 引擎的唯一预期。
- 修改历法或排盘语义时，遵循[领域规则](../../docs/agents/domain.md)适用章节。示例与公开 API 文档应和已实现行为一致。

## 发布

- 未获单独授权时保持 `private`。本地构建或测试通过，只能证明实际运行的环境与范围。
