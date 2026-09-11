# Wasm package invariants

- Rust 只位于 `../../bindings/wasm`，规则只属于 `../../crates/ziwei`；TypeScript 包负责初始化、输入防御、错误与只读投影，不导入 Node 入口或 `.node`。
- 包为单份 ESM，只有根 exports。`initialize({ wasmUrl? })` 显式完成资源校验与初始化；顶层无联网、DOM 操作、Worker 或 top-level await，身份与同步 Ziwei 入口在 ready 后提供。
- `generated/` 和 `dist/` 是生成产物；glue、Wasm 与资源摘要必须来自同一构建。禁止手改、提交生成产物或用错配的二进制更新基准。
- Wasm Natal 的 `dispose()` 幂等；释放后全部 getter、查询、toJSON 拒绝调用，已返回 DTO 保持独立。自动清理由绑定 finalizer 兜底，不依赖 GC 时机保证资源上界。
- 手写源码、测试、Worker、配置和工具使用 TypeScript；开发依赖走根 Catalog，任务由根 mise 编排，不增加 package scripts 或独立锁文件。
- 验收真实 Wasm 与最终 tarball；浏览器使用 Chromium/Firefox/WebKit，不以 DOM 模拟替代真实加载。Node 测试不等于 Safari/iOS/WebView 或原生平台支持。
- 保持 private: true；提交、推送、发布另需授权。公开语义与工程约束同时参照父级 AGENTS.md。
