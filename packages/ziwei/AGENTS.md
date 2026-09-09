# Node package invariants

## 源码与分发

- 手写源码、配置、测试与工具使用 TypeScript。Rust adapter 位于 `../../bindings/node`；排盘规则只属于 Rust 核心。

- 包为单份 ESM 输出，只有根 `exports`。最低 Node 24.15.0；`require(ESM)` 返回同一命名导出，不生成第二份 CJS 实现。公开依赖图禁止 top-level await。

- `src/` 是门面；`native/` 与 `dist/` 是生成产物，不手改、不提交。napi 的 `binding.cjs` 和 `.node` 保持外置；不把 TypeScript 源码直接分发给 Node 执行。

## 工具链与任务

- 依赖版本统一由根 `pnpm-workspace.yaml` 的 Catalog 管理；本包使用 `catalog:`，不得新增第二套版本配置。

- 开发环境统一由根 `package.json` 的 `devEngines` 校验，mise 负责安装与选择版本；本包只保留消费端 `engines.node`，不重复开发约束。安装依赖使用 `mise exec -- pnpm install --frozen-lockfile`，开发任务由 mise 先选择合规环境。

- 开发任务统一在根 `mise.toml` 定义，通过 `mise run` 调用；package.json 只保留包元数据、依赖与约束，不定义重复 scripts。复杂参数通过 `mise exec` 直接启动 CLI；参数边界及入口测试见 [工程验证](../../docs/agents/engineering.md#工具链与检查入口)。

## 验证与发布

- 根目录通过 `mise run check:node` 验证构建、公开 API 和类型合同，再运行 `mise run check:typescript`。最低版本使用 `mise run check:node:minimum`。

- 工具与基准测试分别为 `mise run check:node:tools`、`mise run check:node:bench`；后者会构建相同的 dist，不能与包消费端测试并行。

- Lint 与格式化采用根 Oxc 配置；检查和修复入口、覆盖范围见 [工程验证](../../docs/agents/engineering.md#lint-与格式化)。

- 保留输入防御、冻结、实例属性缓存、错误身份、Worker 与独立 tarball 消费端合同。类型负例不可作为运行时测试执行。

- 发布前需独立验收平台产物、声明和清洁消费端，并获得发布授权。当前 `private: true`，不得发布。
