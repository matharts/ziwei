# @matharts/ziwei-shared

私有 workspace 模块，统一 Node 与 Wasm 的 JavaScript 输入捕获、结构化错误，以及出生档案、星曜、宫位和四化查询结果的只读投影，不发布到 npm。

只通过包的根入口使用。`mise run build:shared` 生成 ESM 和声明；Node、Wasm 的 TypeScript 构建会先执行此任务，再将共享实现与类型内联到各自的分发产物。

`projection.ts` 将绑定返回的数据转换为具名、深层冻结的 `Profile`、`Star`、`Palace`、`LocatedStar`、`PalaceTransformation`，并定义必要的公开数据类型；`identity-types.ts` 只保存这些数据和错误载荷需要的身份类型，不提供运行时枚举或排盘规则。

排盘与查询计算属于 Rust。原生加载、Wasm 初始化与释放、命盘持有、实例缓存和限运投影不属于本模块。
