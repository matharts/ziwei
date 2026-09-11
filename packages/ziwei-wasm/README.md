# @matharts/ziwei-wasm

在浏览器中运行 Rust 紫微斗数引擎。先显式加载 Wasm，再同步创建本命盘、读取星曜与四化、查询大限和流年。

> 当前为未发布的开发包；浏览器兼容范围以实际验收记录为准。

## 使用

```ts
import { initialize } from "@matharts/ziwei-wasm";

const { Ziwei, Gender, Branch } = await initialize();
const natal = Ziwei.fromBirth({
    gender: Gender.Female,
    birthYear: 1992,
    birthMonth: 8,
    birthDay: 15,
    birthHour: Branch.Mao,
});

try {
    console.log(natal.mingPalace(), natal.birthTransformations());
    console.log(natal.decade(0), natal.yearly(0, 0));
} finally {
    natal.dispose();
}
```

输入是历法层归一化后的农历出生资料；时辰使用地支，不是钟表小时。引擎不处理时区、闰月辨识或日期换算，也不生成解释和断语。

也可使用 `Ziwei.fromParameters`，传入 `gender`、`birthStem`、`birthBranch`、`birthMonth`、`ziweiBranch` 和 `birthHour`；这条入口没有数字年份与出生日。

## 加载与部署

默认加载包内配套 Wasm。使用 CDN 时可显式传入 `initialize({ wasmUrl: new URL("https://example.com/ziwei.wasm") })`；资源必须与当前包匹配，成功响应的类型为 `application/wasm`，并符合应用的 CORS 与 CSP。只接受 HTTP(S) URL；生产环境使用 HTTPS。

同一模块实例只初始化一次，同 URL 的并发调用共享结果；不同 URL 会被拒绝。失败后可显式重试，没有后台下载、自动重试或原生/Wasm 隐式切换。

普通单线程使用不需要 `SharedArrayBuffer` 或 COOP/COEP。页面 CSP 若限制脚本执行，须允许 Wasm 编译；批量任务建议在应用的 Dedicated Module Worker 中初始化并执行，避免阻塞界面。

## 数据与生命周期

查询结果是独立的深层只读普通数据；`profile` 与 `palaces` 各自在第一次读取成功后缓存。`toJSON()` 返回可传输快照，不含可恢复的引擎句柄。

不再使用命盘时调用 `dispose()`；重复释放安全，释放后读取或查询抛出 `ZiweiLifecycleError`，此前取出的数据仍可使用。Worker 间传输入或快照，不传命盘对象；结构化克隆不保留冻结状态或错误类身份。

预期的输入和领域错误为中文 `ZiweiError`，使用 `code`、`detail` 区分；加载故障为 `ZiweiInitializationError`。不要通过错误文案解析业务分支。

## 运行环境

面向支持原生 ESM、WebAssembly、Fetch、Web Crypto 的浏览器。导入入口不会自动初始化，适合 SSR 的客户端加载流程；服务端原生执行使用 `@matharts/ziwei`。三引擎自动化通过也不等于 Safari、iOS 或所有 WebView 实机已验证。

## License

MIT
