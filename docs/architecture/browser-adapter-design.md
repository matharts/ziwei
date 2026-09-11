# 浏览器适配设计与验收合同

状态：2026-09-11 已进入并行实施（D-267），实现位于 `packages/ziwei-wasm`。浏览器适配属于必须交付的范围；实际检查见[交付计划](cross-platform-delivery-plan.md)，不从测试引擎推导品牌浏览器或移动设备支持，也不授权发布。

本页负责浏览器加载、部署与消费验收；Rust target、绑定传输和命盘释放方案见 [Wasm 适配设计](wasm-adapter-design.md)。现有领域与查询语义继续以 [Node Interface 合同](node-api-design.md)和 [Rust 架构](rust-package-design.md)为基准。

## 已核对事实与建议

| 已核对事实 | 对本项目的设计建议，不是已验证结果 |
| --- | --- |
| 当前 [index.ts](../../packages/ziwei/src/index.ts) 顶层加载 `native/binding.cjs`；[types.ts](../../packages/ziwei/src/types.ts) 读取原生身份表，身份派生方法也调用 Rust | 浏览器不能直接重导出 Node barrel；仅在第二个 Adapter 实施时提取真实共享 Seam |
| [napi-rs 浏览器 WASI 路线](https://napi.rs/docs/concepts/webassembly#browser-runtime-configuration)使用共享内存、Worker 与 top-level await，要求跨源隔离 | 优先采用独立、单线程的 wasm-bindgen Adapter，不让普通网页必须部署 COOP/COEP；不是断言 WASI 无法用于本项目 |
| [wasm-bindgen 的 web 输出](https://wasm-bindgen.github.io/wasm-bindgen/examples/without-a-bundler.html)支持显式异步初始化，之后调用导出函数 | 初始化成本显式化，建盘与查询继续同步；批量工作由应用 Worker 承担 |
| [Rslib 对 web glue 的处理](https://rslib.rs/guide/advanced/wasm#use-with-wasm-bindgen)走 `new URL` 静态资源管线，`lib.wasm.mode` 不适用 | 按真实 JS/Wasm 资源输出验收，不能只开启 Wasm 编译选项就认定包可用 |

浏览器不复制排盘公式、本地化规则或身份派生规则。两个建盘入口、数字精度、`null`、顺序、输入防御、中文 `ZiweiError` 与 `code/detail`、属性缓存和深层冻结继续对齐现有合同；加载与生命周期故障不伪装成领域错误。

## 包与 Module 职责

采用 `packages/ziwei-wasm` 与私有 npm 包 `@matharts/ziwei-wasm`；Rust 对应 `bindings/wasm`。以下保留选型对照，当前只实现独立包，不增加 Node 子路径或隐式条件入口。

| 候选 | 优点 | 成本与取舍 |
| --- | --- | --- |
| 独立 `@matharts/ziwei-wasm`，推荐 | 浏览器不安装 Node 平台包；显式异步 Interface 与 Node 同步入口分开 | 需要第二份包元数据与验收；共享实现应服务真实重复，不能复制领域规则 |
| `@matharts/ziwei/browser` 子路径 | 同一包名、版本一致 | 改变当前只有根 `exports` 的合同，主包混合原生分发和网页资源；需另行确认 |
| 根入口按 `browser` 条件自动切换 | 调用方导入短 | 同一路径出现不同初始化要求、SSR 解析与错误身份风险；本提案不采用 |

浏览器入口只负责加载与组装。Wasm Adapter 持有 Rust 核心；共享 TS Module 可负责输入捕获、结构化错误、只读投影和缓存。提取时同时跑两个 Adapter 合同，不先增设公开共享包、通用后端注册器或宿主探测框架。

Node 的根导出、`require(ESM)`、同步初始化与原生失败路径保持不变。缺少原生二进制时，不自动切换 Wasm；浏览器加载失败也不转为远端排盘请求。

## 初始化 Interface

以下为 Interface 摘要，完整公开类型以构建后的 `dist/index.d.ts` 为准；`Birth`、`Parameters` 和领域类型沿用既有表示。`WasmNatal` 表示浏览器命盘，新增 Wasm-only `dispose()`。

```ts
export interface InitializeOptions {
  readonly wasmUrl?: URL;
}

export interface ReadyZiweiRuntime {
  readonly Ziwei: Readonly<{
    fromBirth(birth: Birth): WasmNatal;
    fromParameters(parameters: Parameters): WasmNatal;
  }>;
  // 还包含现有全部身份常量及派生方法，名称、值与顺序不变。
  // 如 Gender、Stem、Branch、PalaceName、StarName、Transformation。
}

export declare function initialize(
  options?: InitializeOptions,
): Promise<ReadyZiweiRuntime>;
```

顶层提供 `initialize`、类型及错误类；调用方等待一次，再从 ready 结果解构 `Ziwei` 与身份对象。初始化、生命周期与领域错误分别表示，不导出未就绪的同步引擎，也不在 JavaScript 中重写原生身份派生规则。

初始化及调用合同：

- 导入没有联网、DOM 操作、Worker 创建、全局注册或 top-level await；首次 `initialize` 才加载 Wasm。
- 同一 ESM 模块实例维护一个就绪状态；同资源并发调用共享初始化工作，成功返回同一个冻结 runtime；不承诺返回同一个 Promise，也不承诺每次调用创建新 Wasm 实例。
- 默认 URL 由包内静态 `new URL('./…wasm', import.meta.url)` 解析，不能相对页面地址猜测。调用方传入 `URL` 可选择 CDN 与资源版本；请求使用 `credentials: same-origin`，跨源资源需允许 CORS，不接受 URL 内嵌用户名或密码。
- 加载中或成功后传入不同 URL 应明确拒绝，不允许“首个参数悄悄胜出”。失败不保存半成品；清理后下一次显式调用可重试，不后台无限重试。
- 首个 Interface 不提供初始化取消；若实际出现需求，再讨论 `AbortSignal`、共享初始化与单个等待方取消的关系，不先增加并发状态合同。
- 领域操作仍同步；初始化的网络、HTTP、编译、链接和资源版本故障由 `ZiweiInitializationError` 区分，不伪装为排盘错误。资源使用 HTTP(S)，SHA-256 校验要求 HTTPS 或 localhost 等具备 Web Crypto 的安全上下文。
- 同一 realm 内保持 `ZiweiError` 的 `instanceof` 与判别联合；多份包、不同 iframe、Worker 之间不承诺类身份相等。

## 资源加载与打包

1. Wasm、生成 glue、TS 门面和声明作为同一版本产物构建；构建任务从 Wasm 生成预期字节数与 SHA-256。加载时按该长度有界读取响应，再验证摘要，最后实例化；错批、截断和超长资源均拒绝，不依赖 ABI 是否仍兼容判断配对。
2. Rslib 生成浏览器 ESM 与声明；Wasm 为独立资源，不内联到 JS、不从未固定版本的公共 CDN 隐式下载。`files` 与 `exports` 只暴露必要入口；本轮不指定新增资源子路径。
3. 默认静态 URL 保留到最终产物，使消费端能重写文件名与部署前缀；外置原始目录和生产构建两种路径都验收。生产返回 `application/wasm`，HTTP 失败、HTML 错页、损坏文件和错误 MIME 均单独测试。[流式实例化要求](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static)
4. 门面不调用 `instantiateStreaming`：先完成 HTTP、MIME、长度与摘要检查，再将已验证字节交给 glue。网络、响应体或编译失败保留明确错误，不能绕过 CSP、忽略 HTTP 状态或降级接受错误 MIME。
5. 原生 ESM 静态站、Rslib/Rspack 与 Vite 的独立消费端都安装真实 tarball，验证根路径、嵌套路径和资源哈希；另以真实跨源服务验证显式资源 URL。开发服务器成功不能替代生产构建。[Vite 静态 URL](https://vite.dev/guide/assets#new-url-url-import-meta-url)、[Rspack 资源模块](https://rspack.dev/guide/features/asset-module)
6. TypeScript `Bundler` 模式验证浏览器声明，SSR 场景另做 `NodeNext` 导入检查；生成声明不得引用未分发文件或 Node 原生内部类型。不靠 `skipLibCheck` 遮蔽错误。

浏览器执行的 JS 可以是生成产物；手写入口、Worker、配置与测试仍全量 TypeScript，依赖进入根 Catalog、任务由 mise 管理。Rslib 的 JS 语法目标不能证明 Wasm 指令集兼容，浏览器基线需分别验收。

## 主线程、Worker 与生命周期

单次建盘保持同步；大批量循环会占用调用线程，异步初始化不会使后续计算自动并发。首个交付包含可运行的应用级 Dedicated Module Worker 示例，不内置线程池、RPC 框架或默认 Worker。

- 应用创建同源 Worker 入口，例如静态 `new URL('./worker.ts', import.meta.url)` 经消费端构建；Worker 内独立初始化并独立持有命盘。跨源 Wasm 资源可单独配置，不把 CDN Worker URL 当作普遍可用入口。[Worker URL 与安全限制](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)
- 消息只传输入、请求标识、查询结果或 `toJSON()` 快照；不传 `Natal`、Wasm 指针、共享实例或绑定错误对象。调用方自己选择消息操作，不新增核心批量排盘规则。
- `structuredClone` 不保留冻结描述符或自定义原型；接收端不能把快照宣称为活命盘、保持 `Object.isFrozen` 或错误 `instanceof`。示例若需要只读语义，应验证后按已知 DTO 再冻结；错误只传安全的 `name/message/code/detail`。[结构化克隆限制](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- 查询结果独立于命盘存在；Wasm 命盘采用显式 `dispose()` 与 GC 兜底，见 [Wasm 生命周期设计](wasm-adapter-design.md)。释放后即使属性已有缓存也拒绝访问；这一行为只属于 Wasm，不改变 Node 生命周期合同。
- Worker `terminate()` 是应用放弃该 realm 的所有任务与实例，不是可恢复取消；异步消息层应清理等待请求。页面退出、重复创建/销毁 Worker、任务失败都需要资源回收测试。

## SSR、CSP 与跨源部署

SSR 只承诺浏览器入口可安全导入，不承诺服务器可初始化此浏览器 Adapter。服务端继续显式使用 Node 包；浏览器初始化在客户端生命周期或 Worker 内发生，不通过条件导出把两个 Interface 混在一起。SSR 验收捕获网络、DOM 与 `.node` 访问，保证导入期间均未发生；同时检查产物未注入 Node polyfill。

| 部署场景 | 建议合同与验收 |
| --- | --- |
| 单线程、无 COOP/COEP 的普通 HTTPS 网页 | 必须成功；不读取或创建 `SharedArrayBuffer`，不要求 `crossOriginIsolated === true` |
| 同源 Wasm + CSP | `script-src` 允许脚本及 `'wasm-unsafe-eval'`，`connect-src` 允许 Wasm 请求；Worker 示例另有 `worker-src`；不要求通用 `'unsafe-eval'` |
| 跨源 Wasm/CDN | 验证实际 CORS 响应、重定向、CSP 与资源版本；缺少许可时明确失败，不 `no-cors` 绕过 |
| 应用已有 COOP/COEP | 同样必须成功；外部脚本、Wasm 等资源要符合应用选定的 COEP/CORS/CORP 政策 |
| 严格 CSP 禁止 Wasm 或 Worker | 初始化或 Worker 启动失败应可归因；无静默降级、无增加远端脚本、无隐藏 blob Worker |
| 将来显式增加共享内存/threads | 单独的可选模式与验收，不提高本提案默认门槛；另核对 secure context、隔离与 Permissions Policy |

依据：[MDN Wasm CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution)、[跨源隔离条件](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)。实际 CSP 由应用部署负责；库不能自行设置网页响应头，也不能把所有宿主的策略概括成一份必然适用的配置。

## 独立验收矩阵

以下是验收要求，不是无条件支持声明。当前实测覆盖与剩余缺口见[交付记录](cross-platform-delivery-plan.md#本轮本地验证)。每次记录包/Wasm 摘要、构建批次、浏览器版本、运行 OS 与消费端配置；缺少浏览器或网络能力应标为未验收，不跳过后声称全绿。

| 验收面 | Chromium | Firefox | WebKit | 必须覆盖 |
| --- | --- | --- | --- | --- |
| 原生 ESM、普通静态站 | 实际运行 | 实际运行 | 实际运行 | 无隔离初始化、两入口、完整读取/查询、JSON、错误、冻结与缓存合同 |
| Rslib/Rspack 生产消费端 | 实际运行 | 实际运行 | 实际运行 | tarball 安装、资源输出、嵌套 base、无 Node 依赖与无源码别名 |
| Vite 生产消费端 | 实际运行 | 实际运行 | 实际运行 | 默认 URL 与显式 CDN URL、哈希/路径重写、声明检查 |
| Dedicated Module Worker | 实际运行 | 实际运行 | 实际运行 | Worker 内完整合同、消息往返、并行独立实例、错误与退出清理 |
| 故障与策略 | 实际运行 | 实际运行 | 实际运行 | 404、错 MIME、损坏/错批 Wasm、CORS/CSP 拒绝、并发初始化与显式重试 |
| 生命周期与数值边界 | 实际运行 | 实际运行 | 实际运行 | 重复创建/释放、已返回 DTO 生存期、i32 年边界、数字精度、内存增长后查询 |

Rstest 保留既有 Node 与工具测试；浏览器消费测试已使用 Playwright 驱动真实三引擎，不用 jsdom 代替。精确测试版本随交付记录保存；[Playwright WebKit](https://playwright.dev/docs/browsers#webkit)不是品牌 Safari，三引擎通过不等于 Safari/iOS、WebView 或最低历史版本已受支持。移动浏览器能力也不能替代 Android/OHOS 原生 target 的产物与实机验收。

Worker 响应性采用足够长且有界的固定输入批次，同时检查主线程独立消息和渲染调度持续推进；记录初始化、建盘/查询、消息往返及内存数据，不直接套用 Node 纳秒基准，也不未经校准设置绝对性能阈值。主线程同步批量调用只测正确性与耗时，不宣称无阻塞。

## 实施顺序与工作量

| 阶段 | 完成条件 | 浏览器侧工程粗估 |
| --- | --- | --- |
| B1：确认与最小加载切片 | 包入口、初始化与生命周期决定落地；一份真实 Wasm 在普通网页两入口可用 | 1–2 人日 |
| B2：完整 Interface 与资源交付 | 所有 Node 对齐合同通过；ESM/Rslib 产物及三种消费端可加载 | 2–3 人日 |
| B3：Worker、策略和三引擎 | 独立矩阵通过，错误/重试/生命周期与可追溯证据齐全 | 2–4 人日 |
| B4：交付收口 | 明确支持范围、使用示例、部署限制；与完整平台计划对账 | 0.5–1 人日 |

以上为设计阶段约 5.5–10 人日的粗估，不是实际耗时记录；限浏览器工作，不重复计入 Wasm Rust 绑定、原生平台适配或发布工程。B1–B3 的本轮实现与检查以交付记录为准，不从历史估算推导完成状态。浏览器下载、CI/设备获取与产品决定等待不计入人日。

仍需逐项验收最低浏览器版本、Safari/iOS 与 WebView 设备，以及超出当前测试配置的部署组合。包/入口、ready runtime 和 Wasm-only 释放路径已实施；本机生产消费测试不自动扩大到未运行的品牌浏览器或设备。
