# 实现状态

此表说明当前实现、已确认目标及证据边界。方向决定不等于已实现、已验收或已发布；验收状态仅按能复核的本地证据更新。语言无关行为以[领域合同](domain-contract.md)、[`CONTEXT.md`](../../CONTEXT.md) 和项目决策为准；共享用例与覆盖缺口见 [`conformance/`](../../conformance/README.md)。

| 实现 | 领域与宿主 | 状态 | 目标与退役条件 |
| --- | --- | --- | --- |
| Rust `ziwei` | 完整 V1 领域引擎 | 已实现的独立 Rust crate | Rust core 独立提供 Rust API；TypeScript 另行独立实现领域规则。项目规则权威仍是已确认规则与领域合同，不以源码生成跨语言预期。 |
| Rust Node 绑定 `ziwei-node` 与旧 `@matharts/ziwei` 实现 | 原生 Node 领域调用与宿主 API | 本次工作树中源码已退役 | 由独立 TypeScript 实现直接替换同一 npm 包身份；不新增 `@matharts/ziwei-ts` 或转发包。 |
| Rust Wasm 绑定与 `@matharts/ziwei-wasm` | Rust 领域引擎的浏览器 Wasm adapter | 本次工作树中源码与包已退役 | Wasm 路线已取消；浏览器目标由纯 TypeScript 实现承担。 |
| 独立 TypeScript 领域实现 | Node 与浏览器共同使用的完整 V1 实现 | 本地代码与消费路径已接通，尚未完成完整验收 | Node 包 42 项测试、最低 Node、三浏览器页面/Worker 与干净包消费已在本地通过；共享 conformance 目前有八个独立预期用例，覆盖仍不完整。实现接管 `@matharts/ziwei` 与浏览器交付，不依赖 Rust/Wasm 执行排盘。 |
| Shared conformance | 语言无关的输入、预期、来源与覆盖 | Schema 与八个手算/错误用例已建立；覆盖不完整 | 已覆盖五种五行局、两张完整手算命例的宫星与期间边界、一个干支错误；四化/自化全集和更多边界仍需扩充，不得把既有 Rust 批量输出转成权威预期。 |

## 验收门槛

TypeScript 完整验收至少需要：

- V1 合同逐项对应到共享 case 或明确的其他独立验证材料，并审查尚未覆盖的领域行为。
- Node 入口覆盖 `@matharts/ziwei` 的已确认公开语义，包括两类建盘、只读事实与查询、错误、缺失值和包内导出合同。
- 浏览器环境可直接运行同一纯 TypeScript 领域实现，不加载 Wasm；完成浏览器消费端验证。
- Rust 与 TypeScript 可对同一组独立预期分别验证。实现间对照作为额外一致性证据，不替代固定预期。
- 类型、构建、运行时兼容、分发和使用文档按工程规则分别验收，记录实际完成证据。

本次执行已从源码树删除 Rust Node 绑定、Wasm 绑定及 Wasm 包；这不代表 TypeScript 已完成全部验收，也不代表已发布或远端 CI 通过。后续状态只按可复核的本地与远端证据更新。
