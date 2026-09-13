# Shared JavaScript contract

- 本包只负责输入捕获、参数遗漏判定、结构化错误转换，以及 `Profile`、`Star`、`Palace`、`LocatedStar`、`PalaceTransformation` 的只读投影和必要类型；不依赖 Node／Wasm 包、生成绑定、宿主 I/O 或 Rust 排盘规则。
- 投影只接受绑定返回的独立数据，保留字段、顺序、显式 `null` 和深层冻结；宫位年龄区间沿用原数组并原地冻结。限运投影、命盘持有、缓存、初始化与释放仍由各 Adapter 管理。
- `Profile` 兼容省略字段与显式 `null`；年份、日期必须同时有值或同时缺失，矛盾状态保持原中文错误。转换成功后才由 Adapter 保存结果；Wasm 始终先检查释放状态，再读取缓存。
- 使用单一根 `exports`；消费方声明 `workspace:*` 开发依赖并通过包名导入，不跨包读取 `src`，不使用路径别名绕过包入口。
- 保持 `private: true`。`dist/` 为生成产物；两个消费包必须内联共享 JS 与声明，不留下私有包运行时或类型依赖，包内错误身份保持唯一。
- 工具链、Catalog、mise 任务与验证沿用根指南及[工程验证](../../docs/agents/engineering.md)。改动需通过两侧受影响的输入、错误或投影合同，以及类型检查和独立 tarball 消费验收；转换函数与私有元组不得泄露到消费端公开声明。
