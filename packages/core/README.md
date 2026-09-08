# @ziweijs/core

Node.js／TypeScript 适配层已实现 [已确认的完整 API](../../docs/architecture/node-api-design.md)：建盘、本命数据与查询、四化、按需大限／流年、身份派生方法及 JSON 输出。尚未发布；`private: true` 与 Cargo 的 `publish = false` 防止误发布。API 实现完成不代表跨平台验收或发布流程完成。

## 已实现

- 同步 `Ziwei.fromBirth`、`Ziwei.fromParameters`，返回持有 Rust 核心命盘的对象。
- `Natal.profile`：独立的只读出生档案，首次成功读取后按实例保存；重复读取保持同一引用。年份和出生日同时有值或同时为 `null`。
- `Natal.zodiac`、`Natal.fiveElementBureau`：生肖字符串身份与五行局数字身份。
- `Natal.palaces`：按寅至丑排列的十二宫，包含宫职简繁名称、宫干地支、星曜与大限年龄区间。星曜包含简繁名称与简称、类别、星系、生年四化和双向自化；缺失四化为 `null`。
- `palaces` 首次成功读取后深层冻结并按实例保存，与 `profile` 独立；重复读取同一属性保持同一引用，不同命盘不共享这些快照。
- 十二类冻结身份常量，包括 `YinYang`／`FiveElement`。`Stem`、`Branch`、`PalaceName`、`StarName`、`Transformation` 提供与核心同序的只读 `ALL`；`Gender.yinYang`、`Stem.yinYang`、`Branch.yinYang`、`Branch.zodiac` 校验入参并调用核心。
- 本命定位与宫位关系：`palace`、`palaceByName`、`palaceByStar`、`star`、`palaceStar`、`mingPalace`、`shenPalace`、`originPalace`、`ziweiPalace`、`oppositePalace`、`sanfangPalaces`、`sizhengPalaces`。
- 四化：`birthTransformations`、`selfTransformations`、`palaceTransformation`、`palaceTransformations`、`palaceTransformationSources`。保留固定顺序、同宫关系、生年四化与双向自化，不做连续飞化或解释。
- 限运：`periodIndicesAtAge`、`decade`、`decadeByBranch`、`decadePalaceByName`、`decadeYears`、`yearly`、`yearlyByBranch`、`yearlyPalaceByName`。只计算请求范围；期间宫职不覆盖本命宫职。
- `toJSON` 返回深层只读 `NatalSnapshot`，`JSON.stringify(natal)` 自动使用该出口序列化；数据包含已有事实与四个定位地支，不含方法、句柄、来源或限运预计算。JSON／结构化克隆往返不保留冻结状态，也不恢复查询能力。
- 中文 `ZiweiError`，只读 `code` 与判别联合 `detail`。宿主表示错误与五类核心错误均有运行时测试；宫内未命中、合法年龄未覆盖返回 `null`。非法接收者和意外宿主异常不伪装成领域错误。
- ESM／CJS 共用同一实现与错误类；只导出包根，不公开原生类、内部文件或构造器。

所有查询返回独立深层只读数据，不缓存、不承诺结果引用相等，不依赖完整 `palaces` 快照。仅 `profile`、`palaces` 保证按实例复用；查询结果不反向持有原生句柄。

当前确认的 Node API 没有待实现成员。Wasm、跨平台预编译分包和发布流程尚未实施；本机性能测量与内部优化见下文。运行包声明由实现生成，并与 `docs/architecture/node-api` 的完整目标声明逐项核对，不直接复制目标声明冒充实现。

## 本地使用

从仓库根执行：

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise run check:node
```

`build:node` 构建本机 `.node`、内部声明与公开 TypeScript 门面；`check:node` 随后运行 Node 集成测试和严格类型测试。包测试还会生成本地 tarball，离线安装到独立临时消费端并实际 import／require，结束后清理临时目录，不发布。

上述 mise 任务与仓库根的 `pnpm run build`／`test`／`test:types` 共用 [Node 执行入口](../../tools/node/run.mjs)：显式选择 mise 配置的 Node，并让构建、测试及其子进程继承同一可执行文件目录，避免 PATH 中其他 Node 抢先。任务开头显示实际 Node 版本；`mise run check:node:tools` 验证运行时选择及失败传播。直接从本包或通过 `--filter @ziweijs/core` 调用底层脚本时，仍需调用者管理环境；执行器不新增版本声明、不改全局配置，也不进入分发包。

在本包内或安装本地打包产物的应用中：

```ts
import { Ziwei, Gender, Branch, StarName, PalaceName } from '@ziweijs/core';

const natal = Ziwei.fromBirth({
  gender: Gender.Male,
  birthYear: 1984,
  birthMonth: 1,
  birthDay: 6,
  birthHour: Branch.Zi,
});

console.log(natal.profile.birthStem); // 0：甲
console.log(natal.zodiac, natal.fiveElementBureau); // Rat 6
for (const palace of natal.palaces) {
  console.log(palace.nameHans, palace.stars.map(star => star.nameHans));
}
console.log(natal.star(StarName.WuQu).birthTransformation); // C
console.log(natal.palaceStar(Branch.Yin, StarName.WuQu)); // null
console.log(natal.decadePalaceByName(1, PalaceName.Ming).name); // FuMu：仍是本命宫职
console.log(natal.decadeYears(1)[0]); // { age: 16, year: 1999 }
console.log(natal.yearlyByBranch(1, 9, Branch.Zi).nameHans); // 流命
console.log(natal.toJSON().originPalaceBranch); // 10：戌
```

## 实现职责

Rust 与 TypeScript 源码分离，共同实现一个 Node adapter：

```text
crates/ziwei/              # 唯一排盘引擎
crates/ziwei_napi/         # Cargo 包 ziwei-napi；只有 Rust 绑定
packages/core/            # npm 包 @ziweijs/core
  src/                    # TypeScript 门面
  test/                   # 包根与消费端测试
  bench/                  # 独立公开 API 基准、记录器与工具合同测试；不随包发布
  native/                 # 构建生成：加载器、内部声明、本机 .node
  dist/                   # 构建生成：公开 JS 与声明
package.json              # 私有 workspace 命令入口
pnpm-workspace.yaml       # packages/*
pnpm-lock.yaml            # 全 workspace 共享锁文件
tools/node/               # 根目录 Node 开发入口与进程合同测试；不随包发布
```

- [原生入口](../../crates/ziwei_napi/src/lib.rs)：原生构造与身份辅助；调用输入校验和核心，将建盘结果交给 `natal.rs` 包装。身份目录只读取核心 `ALL`，不初始化命盘。
- [原生命盘](../../crates/ziwei_napi/src/natal.rs)：持有核心 `Natal`，通过核心公开方法按需查询并转换数据；以穷尽枚举映射确定输出身份，集中管理原生内存记账与回收。期间名称读取各自核心类型；年份转为 JS 数字前检查安全整数范围。
- [原生输入](../../crates/ziwei_napi/src/input.rs)与[错误映射](../../crates/ziwei_napi/src/error.rs)：先检查 JS 类型、有限数、整数和值域，再收窄。月份、日期、干支配对及限运序号调用核心校验；预期失败作为内部类型化数据返回，意外 Node-API 异常原样传播。
- `src/index.ts`：公开导出与冻结的 `Ziwei` 构造入口；`src/natal.ts`：私有命盘包装、查询门面、`null` 归一化、按已知结构深层冻结，以及独立的档案／十二宫惰性快照和 `toJSON`。后者不从包根导出。
- `src/input.ts`、`src/error.ts`、`src/types.ts`：分别处理自身数据属性捕获与缺参检查、公开错误外观，以及公开类型与身份常量／派生方法。错误模块对公开身份仅作类型导入，避免运行时循环依赖。
- `native/`、`dist/`：生成产物，不提交；`index.mjs` 只桥接到共享 CJS 实现。
- `test/`：实际包入口、原生防御性数值校验、类型合同、Worker 与独立打包消费端。甲子固定命例来自 [项目命例说明](../../crates/ziwei/tests/fixtures/README.md)。

核心继续使用 `forbid(unsafe_code)`；仅绑定 crate 使用 `deny(unsafe_code)`，以容许 napi-rs 注册宏内部的局部允许声明，手写绑定代码没有 `unsafe`。原生 holder 按当前内联存储大小向 V8 记账，在对应环境回收时减账；独立 JS 档案与宫位快照不重复计入，也不反向持有原生句柄。回收时机由运行时决定，不提供 `dispose`，也不承诺 GC 的时间或内存峰值。

目录分工参考 Rolldown 的 [Rust crate](https://github.com/rolldown/rolldown/blob/d03fd763d5b419407c7e5c675656c1bc7603af8f/crates/rolldown_binding/Cargo.toml)、[npm 包](https://github.com/rolldown/rolldown/blob/d03fd763d5b419407c7e5c675656c1bc7603af8f/packages/rolldown/package.json)与[跨目录构建](https://github.com/rolldown/rolldown/blob/d03fd763d5b419407c7e5c675656c1bc7603af8f/packages/rolldown/build-binding.ts)。本项目保留现有 napi CLI 与 tsc，不引入 Rolldown 的专用构建脚本、WASI 或平台发布分包。包专用开发依赖留在 `packages/core/package.json`，pnpm 版本与安装策略由根目录统一管理；未来 npm 包加入 `packages/*`，不创建占位包。

## 工具与验证边界

公开 API 性能工具位于 [bench/](bench/README.md)：`mise run benchmark:node:smoke` 验证流程，`mise run benchmark:node` 保存完整 provisional 测量，`mise run check:node:bench` 独立测试 CLI／记录／失败处理。每次先构建当前包，保存固定语料的原始样本、环境与源码／产物／合同指纹；CI 仅在一个 Linux 作业运行 smoke 合同测试，不设置性能阈值。它与下方历史分层优化脚本不是同一协议，不能直接对比数字。

mise 固定 Rust 1.98.1、Node 24.20.0、pnpm 12.3.4；直接依赖固定 napi 3.12.2、napi-derive 3.6.3、napi-build 2.4.1、`@napi-rs/cli` 3.9.0、TypeScript 7.0.2，传递依赖由 lockfile 固定。Node-API 基线为 8。

本机已构建并运行 macOS arm64／Node 24 的测试与临时性能测量；CI 已配置在 macOS、Linux、Windows 上执行包内检查，但本次未运行远端 CI。Node 22／26、其他 OS／CPU／libc 与浏览器均未作本轮验证，不能从 Node-API ABI 或 manifest 的目标列表推断支持。`engines.node >=22` 是最低运行时门槛，不是已验证的完整版本矩阵。

### 首个切片验收（2026-09-09）

| 检查 | 本地结果 |
| --- | --- |
| `mise run check:node` | 本机原生构建、11 项 Node 测试、严格类型测试通过 |
| 类型合同 | 11 个编译负例；NodeNext 与 Bundler 解析均通过，已实现的共享类型与设计一致 |
| pnpm 冻结锁文件离线安装 | 通过，无锁文件变更 |
| Cargo workspace debug／release 全特性测试 | 通过，含核心 doctest；不作为 Node 运行时测试的替代 |
| Cargo fmt／全目标全特性 Clippy | 通过，Clippy 使用 `-D warnings` |
| Rust 1.98.0 下绑定及依赖检查 | 全目标、全特性、locked 检查通过 |
| Rust 核心打包消费端 | debug／release 公开测试与 inspect 示例通过，核心运行依赖仍只有 arrayvec |
| CI 配置 | actionlint 1.7.12 与 ShellCheck 0.11.0 通过；未运行远端 CI |

未修改 `crates/ziwei` 或 `tools/xtask` 源码，未提交、推送、发布或执行性能基准。此处的回收测试是强制 GC 与 Worker 退出下的功能冒烟，不是内存峰值或无泄漏的证明。

### TypeScript 升级（2026-09-09）

按用户要求，将项目直接依赖从 5.9.3 升级并精确锁定为当日 [npm latest 稳定版 7.0.2](https://registry.npmjs.org/typescript/latest)，不使用 next／rc 标签；napi-rs CLI 自身的传递依赖不强制覆盖。`tsc --version` 确认为 7.0.2。

升级后重新通过构建、11 项 Node 集成测试，以及实际包和完整设计合同各自的 NodeNext／Bundler 类型检查。没有修改业务代码或放宽类型检查，Rust 工具链与直接依赖不变。

### 命盘对象模块提取（2026-09-09，D-254）

当时从入口文件提取 `src/natal.rs` 与 `js/natal.ts`（D-257 已迁至上文的新位置），不改变构造、字段读取、错误、冻结、缓存或回收行为。新内部模块的 ESM／CJS 包子路径访问均被拒绝；公开导出集合不变。

本轮通过 `mise run check:node`（原生构建、11 项 Node 测试、NodeNext 类型合同）、Bundler 类型合同、Cargo workspace 全特性测试、fmt 和全目标全特性 Clippy。与迁移前比对，既有四个生成的 `.d.ts`、ESM 桥接入口、包清单、锁文件、mise 与 CI 配置逐字节一致。核心源码未修改；未新增查询、运行性能基准、提交、推送或发布。

### 本命只读数据验收（2026-09-09，D-255）

按测试先行的顺序补齐 `zodiac`、`fiveElementBureau`、`palaces`。甲子命例使用核心既有手算 CSV，壬申女命沿用既有完整手算预期，覆盖十二宫、十八星、空宫与多星、正逆大限年龄区间、生年四化及双向自化；不以两条入口彼此相等代替独立预期。

本轮实际通过：

- `mise run check:node`：原生 release 构建、16 项 Node 测试与类型合同，包括独立打包消费端和 Worker。
- NodeNext／Bundler 类型检查：已实现数据结构与设计逐项相等，21 个编译负例覆盖只读、身份、年龄元组及尚未开放的接口。
- 冻结与生命周期：深层只读、按实例复用、跨实例独立；注入冻结失败后验证两个属性互不触发、失败不污染缓存且可重试。独立消费端强制 GC 后仍可读取已取得的子数据。
- Cargo workspace 全特性测试、fmt、全目标全特性 Clippy（`-D warnings`），以及 Rust 1.98.0 下绑定的全目标全特性检查。

仅扩展 Node 适配层与相关文档；核心源码、工具链、依赖与锁文件未修改。未运行远端 CI、其他平台、性能基准，未提交、推送或发布。

### 完整 API 验收（2026-09-09，D-256）

已完成完整设计的 30 个 Natal 成员（4 个属性、26 个方法）、两个建盘入口、五个 `ALL` 和四个身份派生方法。`napi-rs` 技能用于保持薄适配与异常边界，Rust／TypeScript 技能用于穷尽身份转换、数值收窄与公开类型隔离；沿用 TDD 的包根测试边界分批验证，没有新增品牌数字类型或第二套排盘规则。

本轮实际通过：

- `mise run check:node`：release 原生构建、28 项 Node 测试及严格类型合同。覆盖全部查询、十九类有参查询的非法参数与缺参路径、非法接收者、独立命例、只读结果及单项查询不依赖属性快照；继承的 `code` 属性不会将成功数据误判成错误。
- 完整声明匹配：Natal、数据对象、常量对象和公开运行时导出集合与设计一致；30 个类型负例通过。NodeNext／Bundler 解析均通过，`ALL` 不泄漏原生枚举类型。
- 限运边界：顺逆、首末大限／流年、五局年龄闭区间、宫内未命中，以及 i32 极值、零年、负年和超过 i32 的输出年份；两入口缺失状态保持一致。
- 独立 tarball 消费端：离线安装且禁止安装脚本，实际 import／require、查询、限运、JSON、原生错误身份与强制 GC；从安装后的包编译 `.mts`／`.cts` 消费代码。四个 Worker 分别创建、查询并传递纯数据，正常退出。
- Rust：`cargo test --workspace --all-features --locked` 及对应 release 测试通过，各含 101 项核心测试与 16 项 doctest；绑定行为由 Node 集成测试验收。
- `cargo fmt --all -- --check`、全目标全特性 Clippy（`-D warnings`）、Rust 1.98.0 的绑定全目标全特性 locked 检查通过。
- 本页 TypeScript 示例实际执行通过；文档链接、空白与 `git diff --check` 核验通过。

核心源码、工具链、依赖和锁文件未修改；更新了包简介。现有未提交成果保留，未提交、推送、发布或运行性能基准；其他平台及 Node 22／26 尚未验证。Worker／GC 是功能检查，不是无泄漏证明。版本相关转换核对了 napi-rs 的 [类型转换](https://napi.rs/docs/concepts/type-conversions)、[对象](https://napi.rs/docs/concepts/object) 与 [错误处理](https://napi.rs/docs/concepts/error-handling) 文档，并以锁定版本的实际编译／加载确认可用。

### 多包目录与包名迁移（2026-09-09，D-257）

按用户要求分离 Rust 与 TypeScript，将 npm 包改为合法 scoped 名称 `@ziweijs/core`。Cargo workspace 成员、根 pnpm workspace、共享锁文件、mise、CI、包自引用与消费端测试已同步；不保留旧包名兼容别名。保留薄适配职责，未引入新的领域模型、运行依赖或发布脚本。

本轮实际通过：

- 根目录 `pnpm install --offline --frozen-lockfile`，下载数为 0；锁文件仅迁移业务依赖的 importer，所有依赖解析结果和工具版本不变。
- `mise run check:node`：原生 release 构建、28 项 Node 测试及严格 NodeNext 类型合同；Bundler 类型检查另行通过。补充测试后重新通过 28 项测试，独立 tarball 只包含分发产物，包名与单一根导出正确，无 Rust／TS 源文件、workspace 工具或运行依赖；ESM／CJS 均实际加载。
- 迁移前后 Rust／TS 实现源码、ESM 入口和全部五个公开生成声明逐字节一致；核心与 xtask 源码未改动。
- Cargo workspace debug／release 全特性 locked 测试均通过，各含 101 项核心测试与 16 项 doctest；fmt、全目标全特性 Clippy（`-D warnings`）、Rust 1.98.0 绑定检查通过。
- README 与 Rust 架构文档的 Rust 示例、actionlint 1.7.12／ShellCheck 0.11.0、38 个文档相对链接与空白检查通过；除历史决策记录外，当前文件不再引用旧包名或旧目录。远端 CI 与其他平台未运行，不将本机验收等同于平台支持或可发布状态。

旧目录不再存在；其中旧的 `native/`、`dist/` 和 `node_modules/` 已转存至本机 `/tmp/ziwei-node-layout.jh9Ajw/node`，可在系统清理临时目录前取回，新目录已从锁文件重新安装并构建。未删除源码，未提交、推送或发布，npm scope 权限未核验。

### 绑定分层优化（2026-09-09）

保留两项内部改动：输出名称借用核心静态字符串，取消临时 Rust `String` 分配；输入捕获单遍选择最小未知字符串 key，不再构造并排序额外 key 数组。必填字段的捕获顺序、每个描述符读取一次、未知字符串 key 优先于 symbol、中文错误和深层只读合同均不变。输入字段数固定，未知 key 处理由排序改为线性扫描；正常输入仍执行全部校验。

在 Apple M4 Max／Node 24.20.0 上，固定 512 Birth + 512 Parameters、相同批大小、三组交错前后对照中，建盘并首次读取十二宫的批平均中位数由 23.98 µs 降至 23.18 µs；大限／流年查询分别由 3.90／3.95 µs 降至 3.56／3.59 µs。纯建盘没有稳定提速，不能将本轮优化描述为消除了 Node 与 Rust 的性能差距。128～8,192 个未知 key 的独立异常输入测量下降约 40%～66%，不代表正常建盘收益。

另试验了原生显式输出 `null` 并在 TS 就地冻结：TS 局部更快，但额外原生转换抵消收益，未保留。该轮完成时 `natal.ts` 与优化前一致；后续传输调整见下一节。源码、各候选产物、原始样本和测量协议保存在本机 `target/benchmarks/node/layers-XiNNgm/`；属于未提交工作树的 provisional 记录，不是正式性能基线、单次调用 P95 或其他平台承诺。

验证：30 项 Node 测试、NodeNext／Bundler 类型检查、独立打包消费端与 Worker／GC 检查通过；两版各 1,024 盘、653,312 次公开读取／查询的逐盘摘要一致，输出均为深层冻结普通数据。全部五个生成的 `.d.ts` 逐字节一致。Cargo workspace debug／release 全特性测试、fmt、Clippy（`-D warnings`）与 Rust 1.98.0 绑定检查通过。核心、依赖、工具链及公开 API 均未修改；未提交、推送、发布或运行远端 CI。

### 私有元组传输优化（2026-09-09）

原生十二宫读取的采样中，约 48% 的主线程样本经过 `napi_define_properties`，约 17% 经过字符串创建；这是调用栈采样归因，不是各阶段精确耗时或可相加的成本分账。试验了仅宫位元组、仅星曜扁平元组，以及两者结合；最终保留组合方案，未继续引入其他表示。

`NativePalace` 与 `NativeStar` 使用 napi-rs 的输出专用定长元组，后者不再单独构造原生自化记录；三项独立化象都保留并显式传 `null`。TS 只在既有投影函数解构，还原原有具名对象、嵌套结构和深层冻结。公开 API、五份生成的 `.d.ts`、名称归属、按实例惰性保存和原生生命周期记账均不变；没有新缓存、依赖、手写 unsafe 或领域规则副本。[napi-rs 元组与 nullable 转换说明](https://napi.rs/docs/concepts/napi-attributes#classes-and-value-shapes)

Apple M4 Max／Node 24.20.0，沿用固定 512 Birth + 512 Parameters 和同一十八项分层负载。最终三组独立进程按 A/B、B/A、A/B 顺序测量；下表取三次进程中位数的中位数，单位为 µs/操作。

| 操作 | 优化前 | 优化后 | 耗时变化 |
| --- | ---: | ---: | ---: |
| 建盘并首次读取十二宫 | 23.95 | 20.46 | -14.6% |
| 建盘并 `toJSON` | 25.51 | 22.40 | -12.2% |
| 建盘并 `JSON.stringify` | 34.18 | 30.94 | -9.5% |
| 单星查询 | 0.95 | 0.86 | -9.7% |
| 生年四化聚合 | 12.91 | 10.89 | -15.7% |
| 自化聚合 | 23.05 | 19.59 | -15.0% |

首次完整读取三组耗时变化分别为 -14.55%、-14.69%、-14.53%；其批平均耗时倒数约 4.89 万盘/秒，不代表服务容量。纯建盘没有一致的配对提速，宫干四化与限运没有值得宣称的收益，也未观察到明显退化。所有结果均为当前未提交源码的 provisional 本机记录，不与不同协议或机器结果混用。

验证：32 项 Node 测试、严格 NodeNext／Bundler 类型检查、独立 tarball 消费端、Worker／GC、冻结失败重试通过；两版各 1,024 张盘、653,312 次公开操作的逐盘摘要一致。新增检查覆盖全部宫位投影的具名自有数据属性，以及数组原型存在数字属性时缺失化象仍为 `null`。Rust workspace debug／release、fmt、Clippy（`-D warnings`）和 Rust 1.98.0 绑定编译检查通过。最低版本检查不替代该版本下的实际 Node 运行矩阵。

每版另运行三轮各 8,192 张盘的持有／读取／释放检查：持有完整宫位时 JS heap 约 76.5 MiB，释放后回到约 5.15 MiB，基线约 5.07 MiB；已取得的宫位在原生对象释放后仍可用。两版持有内存相近，不宣称减少持久内存或证明无泄漏；RSS 包含分配器保留及验证用 JSON 字符串成本。

源码快照、候选、原始样本、采样栈与重放脚本保存在本机 `target/benchmarks/node/transport-Fu9vyW/`。未修改核心与 xtask 源码，未提交、推送、发布或运行远端 CI；其他平台未验证。
