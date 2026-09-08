# Rust 包与适配层架构

## 状态与目的

本文记录紫微斗数排盘引擎的 Rust 包设计，核心结构已于 **2026-09-07** 按工作区源码同步。当前核心已实现两条建盘入口、本命查询、宫干四化和按需大限／流年，以及 D-237、D-238 的紧凑 Star、ArrayVec 与私有位置索引。2026-09-09 的 D-253～D-256 已完成已确认的完整 Node API；Wasm 尚未实现，跨平台验收与发布未完成。

本文描述当前 implementation 与已确认的架构约束，不替代领域术语表 [`CONTEXT.md`](../../CONTEXT.md) 或 [决策记录](v1-decision-map.md)。历史候选单独标注，不能当作当前实现；源码若与已确认规则冲突，仍须核对决策，不能仅以源码覆盖规格。[架构图](ziwei-architecture.html) 是本文的简化视图。

目标是让 Rust 使用者得到一个小而深的核心模块：调用方只需提供已经归一化的出生资料，并从 crate 根调用 `Ziwei::from_birth` 或 `Ziwei::from_parameters`，即可得到不可变 `Natal`。`Ziwei` 是只承载这两条关联构造方法的公开入口；`Natal` 是命盘结果对象。调用方再在同一个内核中取得本命、大限、流年的只读结果。Node.js/TypeScript 与 WebAssembly 只在各自运行时把这一能力适配出去，不能复制或改变排盘规则。

## 决策摘要

2026-09-09 补充：Node.js/TypeScript 的完整使用合同见 [适配设计](node-api-design.md)，docs/architecture/node-api 为独立设计声明与编译型用例。D-256 已使实际生成声明与完整设计匹配，补齐本命／四化／限运查询、身份辅助及 JSON 输出。D-257 将 Rust 绑定迁至 `crates/ziwei_napi`，TypeScript 迁至 `packages/core/src`；Cargo 包名为 `ziwei-napi`，npm 包名为 `@ziweijs/core`，两者均禁止发布；不新增第二个领域实现。

1. 根 workspace 包含 `ziwei` 与 `ziwei-napi`，`default-members` 仍只选择核心 `ziwei`；开发工具保留独立 workspace。
2. 本命构建、按需大限/流年、只读查询同属 `ziwei`；它们不是独立 Cargo 包。
3. `PalaceName` 是本命、大限与流年共用的唯一十二宫职领域类型；`Palace`、`Decade`、`Yearly` 各自管理自己的宫职及对应简、繁名称，不保留 `PalaceRole` 或 `PalaceScope`。
4. Node.js/TypeScript 与 WebAssembly 在接口稳定后各自成为一个 adapter 包，单向依赖 `ziwei`。
5. 历法换算和解释/断语不属于 V1，不创建对应包。
6. 不创建仅重导出的 Rust 门面包；它会制造浅模块而不提供额外能力。
7. 只有出现真实、独立的边界时才拆包。目录预留不是拆包理由。
8. `Palace` 内联持有真实星曜，`Natal` 私有索引直接定位星曜；这两者均不改变公开切片和借用 interface。
9. 本命事实在建盘时完整生成；宫干四化关系和限运结果按需计算，不保存查询结果缓存。

## 设计原则

### 一个深核心模块

`ziwei` 的 interface 面向三类调用者：项目自身的上层应用、其他 Rust 开发者，以及未来 adapter。它隐藏五行局、安星、生年四化、自化、宫干四化查询和期间计算的具体实现，让调用者通过少量稳定入口取得结果。连续飞化暂缓，不属于当前实现。

因此，领域计算不能分散到绑定层、调用方或多个相互转发的包中。删除 `ziwei` 后，排盘复杂度应该重新出现在所有调用方；这证明它承担了应有的深度与 leverage。

### 只在真实 seam 处拆包

Node-API 与 `wasm-bindgen` 的编译目标、错误模型、对象生命周期和序列化方式不同，因此是两个真实 adapter，分别拆包有价值。

相反，当前的本命计算、查询和期间计算共享同一个不可变 `Natal`，没有第二个实现，也没有独立运行时；把它们拆为 `core`、`query`、门面三层只会扩大 interface，降低 locality。

### 依赖只能向内

所有排盘规则、领域事实、`PalaceName` 宫职名称与 `Star` 星曜名称都由 `ziwei` 内部实现。核心除 Rust 标准库外，仅使用关闭默认特性的 `arrayvec` 实现私有固定容量存储，不向公开 interface 暴露依赖类型。核心不定义运行时本地化、全局语言状态、adapter、JavaScript、WebAssembly、时区、历法或解释模块。

```text
上层 Rust 应用 ───────────────────────────► ziwei
ziwei-napi ────────────────────────────────► ziwei
ziwei-wasm ────────────────────────────────► ziwei
```

`ziwei-napi` 与 `ziwei-wasm` 之间也没有依赖关系。

## Workspace 形状

### 当前形状

```text
.
├── Cargo.toml
├── Cargo.lock
├── package.json                  # 私有 workspace 命令入口
├── pnpm-workspace.yaml           # packages/*
├── pnpm-lock.yaml                # npm workspace 共享锁文件
├── mise.toml
├── lefthook.yml
├── .github/workflows/ci.yml
├── crates/
│   ├── ziwei/
│   │   ├── Cargo.toml
│   │   ├── src/                   # 模块树见下文
│   │   ├── tests/                 # 公开合同、查询、固定命例、负载自检
│   │   │   └── fixtures/
│   │   ├── benches/               # construction-120 与共享 read-path-512 负载
│   │   └── examples/              # inspect 与独立读取基准运行器
│   └── ziwei_napi/                # Cargo 包 ziwei-napi
│       ├── Cargo.toml
│       ├── build.rs
│       └── src/                   # 原生持有、校验与转换
│           ├── lib.rs             # 原生构造与身份辅助入口
│           ├── natal.rs           # 命盘持有、按需查询、投影与生命周期
│           ├── input.rs
│           └── error.rs
├── packages/
│   └── core/                      # npm 包 @ziweijs/core
│       ├── package.json
│       ├── tsconfig.json
│       ├── index.mjs             # ESM 到共享 CJS 的桥接
│       ├── src/                   # TypeScript 门面、只读与错误外观
│       │   ├── index.ts           # 公开导出与 Ziwei 入口
│       │   ├── natal.ts           # 私有包装、查询、深层只读与两个属性缓存
│       │   ├── input.ts
│       │   ├── error.ts
│       │   └── types.ts
│       ├── test/                  # Node、Worker、类型与独立打包消费端
│       ├── native/                # 生成产物；不提交
│       └── dist/                  # 生成产物；不提交
├── tools/
│   └── xtask/                     # 独立 Rust 开发工具 workspace；不参与核心库发布
│       ├── Cargo.toml
│       ├── Cargo.lock
│       ├── src/                   # 统计合同、记录流程、打包消费端校验
│       └── tests/                 # 记录器、命令行与解包测试
├── docs/
│   ├── agents/
│   ├── architecture/
│   └── engineering/
└── CONTEXT.md
```

根 `Cargo.toml` 是 workspace 配置，不是业务包。它统一 edition 2024、MSRV 1.98、许可证与仓库地址，默认成员仍只有核心。核心继承 `forbid(unsafe_code)`；Node 绑定单独使用 `deny(unsafe_code)`，兼容 napi-rs 注册宏内部的局部允许声明，手写绑定不使用 unsafe。所有排盘领域实现和简繁名称均位于 `crates/ziwei`。根 pnpm workspace 单独管理 JavaScript 包与共享锁文件；`packages/core` 通过 `../../crates/ziwei_napi/Cargo.toml` 构建自己的内部原生产物，没有根级 `tests/` 或 `fixtures/` 目录。

`mise.toml` 固定 Rust `1.98.1`、Lefthook `2.1.12`、Node `24.20.0` 与 pnpm `12.3.4`。pre-commit 检查格式与暂存区空白，pre-push 执行 Rust 测试和 Clippy；Node 构建与验收另由 build:node/check:node 承担，不加入本地钩子。基准记录与 Rust 打包校验仍由 `tools/xtask` 完成，不依赖 Node；该目录通过自己的 workspace、publish = false 和 lockfile 隔离开发依赖，绑定与工具均不改变核心运行依赖或公开 API。

### 未来形状

D-257 取代 D-252 的 Node 同目录布局：Rust crate 放入 `crates/`，npm 包放入 `packages/`。新 npm 包由 `packages/*` 纳入 workspace；不为证明“多包”预先创建占位包，也不增加只有转发职责的 npm 原生包。

Wasm 仍是独立 adapter，但其 Rust crate、JS 分发目录与加载合同在实施时确定，不能直接套用 Node 的加载方式。只有达到后文拆分门槛才创建新包；共享命例或根级测试也按实际复用需求迁移，不提前搬动核心测试。

## 包职责

### `ziwei`

这是唯一的领域实现包，也是唯一可以执行排盘规则的包。

它负责：

- 接收 `Birth` 与 `Parameters`，并完成已确认的结构和范围校验。
- 将两类输入归一化为私有构建事实，构建不可变 `Natal`；不引入或导出 `ZiweiSeed` 一类中间领域对象。
- 保存十二宫、十八星、生肖、五行局、命/身/来因/紫微宫定位、生年四化与自化等本命事实；宫干四化关系由查询时按需生成，不预存四十八条关系。
- 按需计算大限与流年；不在构建 `Natal` 时预存完整期间序列，也不在核心中缓存。
- 提供已确认的只读宫位、星曜与四化查询；连续飞化暂缓，不纳入当前核心。
- 由 `PalaceName` 表达本命、大限与流年共享的十二种宫职，由 `StarName` 表达稳定星曜身份；`Palace`、`Decade`、`Yearly` 各自管理自己的宫职及对应简、繁名称，`Star` 提供固有名称与简称。`Stem` 与 `Branch` 的固定简体 `Display` 仅用于组合 `ZiweiError::Display` 中文诊断。
- 返回可匹配的领域错误，且不依赖绑定层错误类型。
- 按 D-239，V1 错误合同为 `ZiweiError` 变体与载荷；跨语言稳定错误码由绑定实现阶段确定。计算追踪延期到 V1 之后，当前不提供追踪 API 或过程记录；具体边界见[适配合同](adapter-contract.md)。

它不负责：

- 公历/农历换算、闰月、时区、晚子时、真太阳时或日期有效性。
- Node-API、JavaScript 对象、Wasm ABI、JSON、浏览器能力或运行时初始化。
- 解释、断语、评分、建议或其他分析能力。

Cargo 包名与 Rust import 名均为 `ziwei`。不能通过新增纯重导出门面包来回避这一决策。

### `ziwei-napi` 与 `@ziweijs/core`（完整 Node API 已实现）

实际进展见 [Node 包说明](../../packages/core/README.md)。以下完整职责中的两类建盘、读取、查询、限运、身份辅助、错误、JSON 与加载均已实现；跨平台验收和发布流程不在此次实现范围。

保留 D-254 的模块职责，按 D-257 分离源码位置：`crates/ziwei_napi/src/lib.rs` 与 `packages/core/src/index.ts` 保留各自的构造入口，命盘对象实现分别集中在各自私有的 `natal.rs` 和 `natal.ts`。原生持有、记账与回收不拆散，TS 冻结与实例缓存不拆散；内部包装函数不增加包根导出或包子路径。生成产物位于 `packages/core/native` 与 `packages/core/dist`，npm 消费端不依赖 Rust 源码或本仓库路径。

该 adapter 面向 Node.js/TypeScript。它依赖 `ziwei`，并且只做以下转换：

- 将 JavaScript 传入的数字、字符串或对象解析为核心确认的输入类型。
- 持有或封装 `Natal`，以适合 Node 对象生命周期的方式暴露构建和查询。
- 通过核心只读方法取得事实与简繁名称，再转换为约定的 TypeScript 输出与错误代码；不依赖私有字段布局。
- 提供 Node 端端到端测试、打包和平台构建配置。

它不能内置规则表、重算宫位、修正核心结果，或创建第二套 `Natal` 结构。

### `ziwei-wasm`（后续）

该 adapter 面向浏览器和其他 Wasm host。职责与 `ziwei-napi` 相同，但实现可针对 `wasm-bindgen`、Wasm 对象生命周期和 Web 测试 runtime 调整。

它同样不能包含领域规则。Wasm 不是 `ziwei` 的 feature：两者是不同 adapter，拥有不同的编译与测试约束。

## `ziwei` 内部模块图

当前按“领域事实、排盘规则、公开入口”分离内部职责。`domain` 只是私有的物理组织方式，不能成为调用方必须了解的公开路径。

```text
src/
├── lib.rs                       # 私有模块声明与扁平公共重导出
├── domain.rs                    # 领域子模块声明与领域类型聚合
├── error.rs                     # ZiweiError 公共失败类型
├── rules.rs                     # 私有排盘规则、公式与测试
├── ziwei.rs                     # Ziwei 公开创建入口，不包含具体规则
└── domain/                      # 私有领域模块
    ├── primitive.rs             # 阴阳、五行、五行局、性别、天干、地支、生肖
    ├── profile.rs               # 出生资料值、两类公开输入与 Profile
    ├── natal.rs                 # Natal 本命盘结果
    ├── palace.rs                # 宫位与 PalaceName
    ├── star.rs                  # 星曜与 StarName
    ├── transformation.rs        # 四化与自化值
    └── luck.rs                  # 限运领域对象和值
```

### `lib.rs`

crate 根是 Rust 使用者的唯一外部 seam。它重导出已经稳定的输入、基础领域值、错误、`Ziwei` 创建入口与 `Natal` 结果类型；已接通的公开排盘入口仅有 `Ziwei::from_birth` 与 `Ziwei::from_parameters`。不暴露 `rules` 的文件布局或私有计算辅助类型。

使用者应当可以在不理解星曜安置、数组存储次序或规则表位置的前提下使用核心库，也不需要进入子模块构造输入或标注结果类型。`Ziwei` 仅公开 `from_birth` 与 `from_parameters` 两条关联构造方法；`Natal` 提供命盘事实与查询。内部重构不得迫使调用方改 import 路径。

两种入口的用法：

```rust
use ziwei::{Birth, BirthDay, BirthMonth, Branch, Gender, Parameters, Stem, Ziwei, ZiweiError};

fn main() -> Result<(), ZiweiError> {
    let birth = Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8)?,
        birth_day: BirthDay::try_from(17)?,
        birth_hour: Branch::Mao,
    };
    let from_birth = Ziwei::from_birth(birth)?;
    let parameters = Parameters::new(
        Gender::Female,
        Stem::Ren,
        Branch::Shen,
        BirthMonth::try_from(8)?,
        Branch::You,
        Branch::Mao,
    )?;
    let natal = Ziwei::from_parameters(parameters)?;

    assert_eq!(natal.ziwei_palace().branch(), Branch::You);
    assert_eq!(from_birth.palaces(), natal.palaces());
    assert_eq!(from_birth.profile().birth_year(), Some(1992));
    assert_eq!(natal.profile().birth_year(), None);
    Ok(())
}
```

### `domain`

`domain` 是私有模块，集中领域值、输入和命盘对象。它不会形成 `ziwei::domain::*` 公开路径；`lib.rs` 从 `domain` 选择性重导出已确认类型，因此内部迁移不能迫使调用方修改 import。

`domain.rs` 只声明子模块并聚合领域类型，不放排盘规则、运行时状态或第二套对象表示。子模块实现继续位于 `domain/*.rs`，避免使用旧式 `domain/mod.rs` 路径。

### `domain/primitive.rs`

此模块提供阴阳、五行、五行局、性别、天干、地支和生肖等封闭、可比较的基础领域值，而不是以字符串或裸整数在内部传递。子=`0`至亥=`11`的地支索引、天干与地支的阴阳属性、以及地支到生肖的一一映射均在这里定义；当前没有天干／地支的公开五行读取方法。`Stem` 以 crate 私有的关联常量 `FIVE_TIGER_DUN_PALACE_STEMS` 保存五虎遁的五组十二宫干固定表，但不承担排盘选择行为。

`FiveElement` 与 `FiveElementBureau` 仍是两个独立领域类型；共同位于 `primitive.rs` 只表示它们同属基础领域值，不允许相互替代。五行局没有 `element()` 或 `number()` 方法；按 D-114，当前枚举判别值仍明确为 2～6，Rust 调用方可以使用 `as u8`，不能将“没有 getter”理解为数字判别值不可观察。`FiveElementBureau::from_ming_palace(stem, branch)` 是 crate 私有的明确关联构造函数，隐藏命宫干支到五行局的固定分组表；不使用语义含混的 `From<(Stem, Branch)>`。

### `domain/profile.rs`

此模块保存 `BirthMonth`、`BirthDay`、`Birth`、`Parameters` 与 `Profile`。它不进行历法换算，只校验核心已经承诺的输入不变量。

`profile` 是 crate 私有的出生资料模块名；`Profile` 与上述出生资料值和输入类型继续由 crate 根扁平导出。

`Birth` 保留数字农历年、月、日、时和性别，用排盘规则导出年干支与紫微支。`Parameters` 保留性别、组成有效六十甲子年柱的生年干支、月、紫微支和时；它没有 `birth_year` 与 `birth_day`。

### `domain/natal.rs`

此模块定义不可变 `Natal` 本命盘结果，保存出生档案、生肖、五行局、十二宫以及已经确认的命宫、身宫、来因宫和紫微星定位事实。`Natal` 不保留原始输入或输入来源。按 D-238，私有构造器从最终宫位遍历一次建立十八项星曜位置索引，每项以两个 `u8` 保存宫位和宫内下标；不保存自引用，不进入公开事实或 Debug。Clone、移动后查询仍借用对象自己的存储，不产生查询结果缓存。

当前数据所有权与访问方式如下。表中的内部字段不是公开字段协议；除 `Birth` 外，结果对象通过只读方法访问，构造由库内完成，`Parameters` 则通过公开的校验构造器创建。

| 对象 | 实际保存的内容 | 公开读取与约束 |
| --- | --- | --- |
| `Birth` / `Parameters` | 两组输入，前者带数字年与出生日，后者带生年干支与紫微地支 | `Birth` 字段公开；`Parameters::new` 校验干支阴阳，字段私有且有 getter |
| `Profile` | 数字年份、性别、生年干支、出生月、时辰、出生日 | 由 `Natal::profile()` 借用；数字年与日用 `Option` 表示有无 |
| `Natal` | Profile、生肖、五行局、十二宫、定位字段及私有星曜索引 | `palaces()` 借用固定数组；定位宫位和星曜直接返回自身借用，不公开位置索引 |
| `Palace` | 宫职、地支、宫干、固定容量星曜集合、大限年龄区间 | `stars() -> &[Star]`；宫内 `star` 可返回 `None`；名称由宫职派生 |
| `Star` | 星曜身份、类别、星系、生年四化、向心／离心自化 | 四个名称／简称 getter 查静态资料；实例不保存字符串引用 |
| `Decade` / `Yearly` | 每个实际宫位在指定期间的 `name: PalaceName` | 按值返回十二项；对象不携带期间索引、年份或实际宫位地支 |
| `DecadeYear` | `age: u8`、`year: Option<i64>` | 按时间返回十项；与按宫位排列的十二项数组不同 |
| `PalaceTransformation` | 源地支、目标地支、化象、目标星曜身份 | 每次按源宫查询生成四项；它不是存储在 Natal 中的关系表 |

`DecadeDirection`、`PalaceStars`、`StarLocation` 和 `rules` 都是内部 implementation，不在 crate 根公开。`Natal` 不提供可变宫位或星曜借用，索引因此无需失效或刷新机制。

`Natal::decade(&self, index: DecadeIndex) -> [Decade; 12]` 是按需生成大限宫职的公开 interface。方法只将不可变本命盘及已验证序号转发给 `rules::compute_decade`，不在领域对象中编写排布公式或增加期间字段。返回数组与 `palaces()` 按寅至丑逐项对应，直接按值返回而非 `Result`；每项通过 `Decade` 的既有方法读取宫职及简繁名称。

`Natal::decade_years(&self, decade: DecadeIndex) -> [DecadeYear; 10]` 按需返回指定大限内的十项虚岁与数字年份摘要，数组按时间递增，而非按宫位排列。公开方法只转发至 `rules::compute_decade_years`，不增加字段、错误分支或缓存，也不生成流年宫职。

`Natal::yearly(&self, decade: DecadeIndex, index: YearlyIndex) -> [Yearly; 12]` 按需返回指定大限内某一流年的宫职，数组按寅至丑与 `palaces()` 对齐。两个参数分别选择大限和该大限内的流年，均由值类型保证范围。公开方法只转发至 `rules::compute_yearly`，不增加字段、错误分支或缓存；结果不依赖数字出生年份，两种创建入口都可查询。

`Natal::decade_palace_by_name(decade, name)` 与 `yearly_palace_by_name(decade, yearly, name)` 通过规则层直接定位期间宫职所在的实际地支，再返回本命 `&Palace`。单宫定位与完整期间布局共享期间命宫计算；单宫查询不生成十二项数组，不扫描宫职布局、不缓存、不分配堆内存。返回宫位的 `name()` 仍为本命宫职，不改变 `Decade` / `Yearly` 的事实归属。

`Natal::palace_transformation_sources(target_branch)` 查询指定宫位的四化来源，在既有逐源宫四化查询上组合惰性迭代器，按源宫寅至丑、每宫 A/B/C/D 顺序筛选目标。完整消费最多检查四十八条关系，只保留当前源宫的四项临时数组，不物化全盘关系表、不建立反向缓存。无命中时为空，同宫及同源不同化象均保留。

`Natal::period_indices_at_age(age)` 将虚岁直接映射为 `Option<(DecadeIndex, YearlyIndex)>`，规则层先以 `checked_sub` 检查局数起限下界，再要求偏移小于 120，通过既有校验构造索引。不遍历宫位年龄区间或年度摘要，不依赖数字年份、顺逆或缓存。

`Natal::decade_by_branch(decade, branch)` / `yearly_by_branch(decade, yearly, branch)` 转发至规则层，只按值生成一项 `Decade` / `Yearly`。私有 `compute_palace_name` 同时服务完整宫职布局和单宫读取，期间命宫定位亦复用既有函数；不生成十二项临时数组，不改变本命事实或期间对象字段。`Natal::opposite_palace(branch)` 直接对寅起宫位索引增加六并环绕，返回本盘借用。

`Natal::sizheng_palaces(branch)` 使用寅起宫位索引加固定偏移 `[0, 4, 8, 6]`，直接生成四个本命宫位借用。`sanfang_palaces(branch, include_self)` 复用该固定数组的迭代器，仅在不含本宫时跳过首项，公开 `ExactSizeIterator` 使调用方可读取剩余长度。两者没有堆分配、缓存或新增领域类型，空宫仍作为实际宫位返回，不按星曜内容过滤。

`Natal::palace_transformation(source_branch, kind)` 转发至规则层，以源宫宫干和化象直接查既有十干四化表，再用本命星曜位置索引定位目标，仅构造一条 `PalaceTransformation`。内部启用 `Transformation::index()` 供生产查询使用，仍为 `pub(crate)`；不生成完整四项结果，不增加公开类型、字段或缓存。批量查询保持原来的单次宫干读取与四项生成方式，两入口共用四化表。

### `domain/palace.rs`、`domain/star.rs` 与 `domain/transformation.rs`

这三个模块分别保存宫位、星曜和四化领域对象。`PalaceName` 与 `DecadeAgeRange` 位于 `domain/palace.rs`；前者以十二个稳定变体表达本命、大限与流年共享的宫职身份，后者表达实际宫位对应的大限虚岁区间。实际 `Palace` 固定保存 `name: PalaceName`、`branch: Branch`、`stem: Stem`、宫内星曜集合与 `decade_age_range: DecadeAgeRange`，不经过 `PalaceRole`、`PalaceScope` 或其他宫职包装类型。它始终表示本命实际宫位，并自行管理本命宫职的简、繁名称。`Star` 继续提供名称、简称、生年四化与向心/离心自化事实。

**已实现的存储策略（D-235、D-238）**：宫内星曜采用私有 `ArrayVec<Star, 6>`，构建时直接移入真实星曜，不构造占位 Star，不做运行时扩容或堆回退。新增星曜或改变安星规则时同步重算容量并更新覆盖测试；容量不是永久领域上限，也不向调用方公开。`stars() -> &[Star]`、不可变性质及宫内固定星序保持不变，`try_push` 失败时显式 panic，不能静默截断。固定容量集合贯穿构建和保存阶段，不再统计星数、分配 Vec 或转换 Box。Star 紧凑布局沿用 D-237。

**已实现的 Star 布局（D-237）**：实例保存身份、类别、星系、生年四化和自化事实，不重复持有四个字符串引用。名称及简称通过身份索引编译期生成的私有静态资料；四个 const getter 的名称、签名与返回值不变，Debug 保留原可观察字段及顺序。它不是全局语言配置，也不增加调用方步骤、依赖或缓存。类别和星系仍由规则层传入，构造器不推导或更改它们。

星曜落宫、生年四化、自化、名称资料与 Natal 位置索引的数组长度统一取 `StarName::ALL.len()`，不再分别手写 `18`；当前唯一全集声明及固定命例仍明确十八星。下文签名中的 `18` 表示这一既定领域规模，源码使用对应的编译期长度表达式，不引入运行时计算或新公开类型。它只减少尺寸声明的联动，不自动支持新增星曜：星集、安星规则、顺序映射及容量仍须一起确认和验证。

单宫容量继续保持私有的 6。公开查询测试穷尽紫微地支、月份、时辰的 `12 × 12 × 12` 种落宫组合，验证真实单宫最大星数恰为 6；不依赖容器类型或私有常量。这将原隔离实验中的容量观察纳入常规回归，但不把 6 定义为未来规则的永久上限。

#### 历史评估：按实际星数存储的其他候选

D-235 至 D-237 阶段要求仅使用标准库、核心禁止 unsafe、读取仍返回借用的 `&[Star]`，并遵守固定容量策略。以下是当时的内部候选，不是当前生产布局。D-238 已允许 ArrayVec 依赖，自有源码禁止 unsafe 的要求不变。

| 候选 | 表示与优点 | 代价 |
| --- | --- | --- |
| 已初始化数组与有效长度 | `[Star; 6]` 加长度；只暴露有效前缀，已有隔离实验 | 需要有效的占位 Star；须确保占位值不被当作命盘事实读取、比较或输出 |
| 按实际星数区分的私有枚举（已隔离验证） | 分别保存空集合、`[Star; 1]` 至 `[Star; 6]`；不构造占位 Star，不用 unsafe 或堆分配，借用各分支数组即可返回切片 | 有七个分支；增加容量时需要扩展分支；本轮发现性能依赖 Star 布局，组合方案还有查询退化 |

第二种可暂称 `PalaceStars`，与 `Palace` 一起放在现有 `domain/palace.rs`，不公开、不新增文件。它只是存储实现，不改变星曜事实。枚举只在当前分支中持有实际星曜，但对象仍需为最大分支预留空间，并不按当前星数动态缩小。

当时的隔离候选采用以下结构；最终未合入生产：

```rust,ignore
enum PalaceStars {
    Empty,
    One([Star; 1]),
    Two([Star; 2]),
    Three([Star; 3]),
    Four([Star; 4]),
    Five([Star; 5]),
    Six([Star; 6]),
}
```

两种候选借用切片均为 O(1)，遍历为 O(k)，k 为宫内真实星数；布局、构建搬移及分支可能影响性能，不能仅凭复杂度或旧实验决定。D-236 已验证 0～6 星、超容量拒绝且保留原状态、顺序、Clone/Eq/Debug，以及两类公开创建入口的完整事实；隔离候选 92 项测试通过，双负载建盘、名称读取和四项期间／四化查询分别测量。

`[Option<Star>; 6]` 可以安全表达空槽，但不能直接作为原 interface 要求的 `&[Star]` 借用；自行管理 `MaybeUninit` 并重新借用已初始化部分需要 unsafe，不符合自有源码约束（见 [Rust 官方 MaybeUninit 文档](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html#method.assume_init_ref)）。D-238 改用 ArrayVec 的安全接口，由依赖封装底层 unsafe；不声称依赖树完全没有 unsafe。

前轮隔离测量中，保留当时 72 B Star 时，枚举使 Natal 自身体积升至 5,312 B，规律输入建盘慢约 49%～52%，混合输入慢约 29%；不能单独替换 Palace。结合 6 B 紧凑 Star 时，混合输入建盘耗时下降约 63%～64%，但宫干四化查询慢约 30%，两轮测量一致。仅显式指定枚举标签也未消除查询退化。这些历史测量不作为当前正式基线。

D-237 因而先落地紧凑 Star、保留 `Box<[Star]>`。补齐读取负载后，还观察到枚举的生年四化聚合和自化遍历退化；单独控制宫干四化循环展开没有解决整体问题，枚举及该查询调整均未合入。随后 D-238 分别验证 ArrayVec、位置索引及两者组合，用户明确接受名称遍历、大限查询和保留命盘 RSS 的代价后，合入组合方案。建盘、查找、聚合、名称和生命周期必须联合验收，不能把建盘收益当作全部操作的性能结论。

### `domain/luck.rs`

`domain/luck.rs` 承载完整限运领域；当前保存 `DecadeIndex`、`YearlyIndex`、`DecadeYear` 与 `DecadeDirection`，并定义 `Decade` 与 `Yearly`。一个 `Decade` 表示某个实际宫位在指定大限中的宫职结果，一个 `Yearly` 表示某个实际宫位在指定流年中的宫职结果；二者都只保存 `name: PalaceName`，期间序号、年龄、数字年份与实际宫位地支均不进入对象。`Decade` 与 `Yearly` 分别直接提供自身宫职身份及“大命～大父”“流命～流父”的简、繁名称。指定大限按寅至丑的实际宫位固定顺序生成 `[Decade; 12]`，指定流年按同一顺序生成 `[Yearly; 12]`，均不预计算、不缓存。未来实现流月、流日、流时时，其领域值也归入此模块。`luck` 只是私有领域模块名称，不因此引入无行为的公开 `Luck` 枚举、结构体或 trait。

`DecadeYear` 只保存 `age: u8` 与 `year: Option<i64>`，通过同名只读方法公开。`i64` 用于容纳任意 `i32` 出生年份加上期间偏移后的结果；`Birth::birth_year` 与 `Profile::birth_year` 的数值类型不变。`None` 只表示没有数字出生年份锚点，不兼作溢出标记。

### `error.rs`

此模块定义 crate 根公开的 `ZiweiError`。它位于 `domain` 外，因为出生值校验和未来的排盘入口共同使用这一失败类型。

### `rules.rs`

此私有模块保存排盘公式与布局算法。它不从 crate 根重导出，也不引入流派或规则版本。

规则函数之间优先传递领域值。宫位定位结果使用 `Branch`，宫职排布与大限年龄区间计算也接收命宫地支；子起地支索引与寅起宫位索引只在函数内部按所访问数组的顺序转换。宫干、宫职、大限顺逆与年龄区间分别使用 `Stem`、`PalaceName`、`DecadeDirection` 与 `DecadeAgeRange`；完整的 `Palace` 由 `compute_palaces` 组装，`Natal` 由 `compute_natal` 统一构建。

命宫与身宫地支由 `compute_ming_shen_branches(birth_month, birth_hour)` 一次计算并按 `(命宫地支, 身宫地支)` 返回；月份基准与时辰索引只计算一次，两种顺逆方向仍保持独立、明确。内部纯计算函数统一使用 `compute_*` 前缀。

来因宫由 `compute_origin_palace_branch(birth_stem) -> Branch` 按已确认的十天干固定映射直接确定。本命宫职由 `compute_natal_palace_names(ming_palace_branch: Branch) -> [PalaceName; 12]` 排布；大限年龄区间由 `compute_decade_age_ranges(bureau, direction, ming_palace_branch: Branch) -> [DecadeAgeRange; 12]` 排布，两种数组均按寅至丑输出。

大限宫职由 `compute_decade(natal: &Natal, index: DecadeIndex) -> [Decade; 12]` 按需生成。它读取本命命宫及档案中的性别、生年干，复用大限顺逆规则定位大命，再始终逆布十二宫职；既不重新构建本命盘，也不重算年龄区间。计算使用固定数组，无堆分配、无缓存，不改变既有星曜、宫干或其他本命事实。

年度摘要由 `compute_decade_years(natal: &Natal, decade: DecadeIndex) -> [DecadeYear; 10]` 按需生成。起始虚岁为五行局数加 `10 × 大限序号`，此后逐年递增，不依赖宫位顺逆或宫职布局。数字出生年份先经 `i64::from` 扩宽，再加虚岁减一；不进行历法换算或跳过零年。全部虚岁在 `2..=125`，最大年份偏移为 `124`，因此不会发生 `u8` 年龄或 `i64` 年份溢出。结果为固定数组，无堆分配、无缓存。

流年宫职由 `compute_yearly(natal: &Natal, decade: DecadeIndex, index: YearlyIndex) -> [Yearly; 12]` 直接计算。五行局和期间序号确定虚岁，以生年支加虚岁减一（模十二）定位流命，再逆布十二宫职。年龄与生年支索引相加至多 `136`，先在 `u8` 范围内完成计算并归一化，之后才转入有符号宫位差计算，避免误用 `i8` 溢出。不读取数字出生年份或大限顺逆，不调用大限宫职及年度摘要生成函数，也不进行历法换算；返回固定数组，无堆分配、无缓存。

紫微地支由 `const fn compute_ziwei_branch(bureau: FiveElementBureau, birth_day: BirthDay) -> Branch` 直接计算，供 `Birth` 构建路径使用；`Parameters` 使用已有的紫微地支。公式沿用[旧 Rust 实现](https://github.com/matharts/ziwei/blob/7164d856b99261f8a439dfae0381aaa196c6788c/crates/ziwei_core/src/domain/placement.rs#L201)与[旧 Zig 实现](https://github.com/matharts/ziwei/blob/264567b8dbcb5da6520d9b9248fcd2e9cce71f3b/src/models/placement.zig#L292)：日数除以局数取上界商，补数奇退偶进；当前不生成定位查表。测试以固定样例与独立逐宫计数对照，覆盖五种局的初一至三十。

十八星统一由 `compute_star_branches(ziwei_branch: Branch, birth_month: BirthMonth, birth_hour: Branch) -> [Branch; 18]` 定位，供两种输入路径复用。返回数组与 `StarName::ALL` 完全对齐，每项是对应星曜的落宫地支，不是十二宫展示顺序。按 D-233、D-234，入口读取编译期生成的主星表，并分别按月份和时辰读取共用辅星表，仍通过分段复制组装十八项；不改变排布规则、不引入新类型或堆分配，也不组装 `Star`。测试通过统一入口运行，保留原有主星和辅星的固定落宫基准，覆盖全部 `12 × 12 × 12` 紫微位置、月份、时辰组合；不重复保留直接调用私有辅助函数的测试。

十四主星公式保留在私有 `const fn compute_major_star_branches(ziwei_branch: Branch) -> [Branch; 14]` 中，供编译期生成 `MAJOR_STAR_BRANCHES_BY_ZIWE: [[Branch; 14]; 12]`。行按紫微在子至亥排列，列对应 `StarName::ALL` 的前十四项，不含四颗辅星的占位值，也不组装 `Star`。规则沿用[旧 Rust 实现](https://github.com/matharts/ziwei/blob/7164d856b99261f8a439dfae0381aaa196c6788c/crates/ziwei_core/src/domain/placement.rs#L226)与[旧 Zig 实现](https://github.com/matharts/ziwei/blob/264567b8dbcb5da6520d9b9248fcd2e9cce71f3b/src/models/placement.zig#L323)：紫微组逆布，天府组顺布，天府与紫微关于寅申轴对称。运行时按紫微地支读取对应行，不重复执行安星公式；测试仍使用独立固定落宫基准，覆盖十二种紫微位置的全部十四主星。

四颗辅星由私有辅助函数 `compute_minor_star_branches(birth_month: BirthMonth, birth_hour: Branch) -> [Branch; 4]` 定位，按左辅、右弼、文昌、文曲输出，对应 `StarName::ALL` 的最后四项。左辅从辰起正月顺行，右弼从戌起正月逆行；文昌从戌起子时逆行，文曲从辰起子时顺行。规则沿用[旧 Rust 实现](https://github.com/matharts/ziwei/blob/7164d856b99261f8a439dfae0381aaa196c6788c/crates/ziwei_core/src/domain/placement.rs#L277)与[旧 Zig 实现](https://github.com/matharts/ziwei/blob/264567b8dbcb5da6520d9b9248fcd2e9cce71f3b/src/models/placement.zig#L355)。相同偏移下的两组落宫恰为逆序，因此共用 `MINOR_STAR_BRANCH_PAIRS: [[Branch; 2]; 12]`，编译期生成每个偏移对应的“辰顺布、戌逆布”地支对。运行时月份减一取左辅、右弼，时辰索引取文曲、文昌，再按既定星序输出；仍分别读取两行，不手填表值、不生成完整输入笛卡尔积，也不组装 `Star`。测试使用固定月、时落宫基准交叉验证全部 `12 × 12` 组合，同时验证左右仅随月份变化、昌曲仅随时辰变化。

五虎遁由 `compute_palace_stems(birth_stem)` 根据生年天干选择 `Stem::FIVE_TIGER_DUN_PALACE_STEMS` 中的一组。固定表属于 `Stem`，选择动作属于排盘规则；不创建五虎遁子模块。领域测试覆盖五组完整表值，规则测试覆盖十个生年天干到五组排布的映射。

十干四化目标星曜由 `const fn compute_transformation_stars(stem: Stem) -> [StarName; 4]` 返回，顺序对应 `Transformation::ALL` 的禄、权、科、忌。函数接收通用天干，供后续生年四化、宫干四化与自化规则共用。固定映射存于 `rules.rs` 的函数外私有常量 `TRANSFORMATION_STARS_BY_STEM`，行对应 `Stem::ALL`；不新增文件，不修改 `Star`，也不生成四化关系。映射以已确认的项目规则为准，与[旧 Rust 实现](https://github.com/matharts/ziwei/blob/7164d856b99261f8a439dfae0381aaa196c6788c/crates/ziwei_core/src/domain/stem.rs#L12)和[旧 Zig 实现](https://github.com/matharts/ziwei/blob/264567b8dbcb5da6520d9b9248fcd2e9cce71f3b/src/models/star.zig#L137)一致，壬干固定返回天梁、紫微、左辅、武曲。测试通过函数验证全部 `10 × 4` 映射，并在常量求值中验证壬干化科为左辅。

生年四化由 `fn compute_birth_transformations(birth_stem: Stem) -> [Option<Transformation>; 18]` 分配，数组顺序与 `StarName::ALL` 一致。函数复用 `compute_transformation_stars`，将禄、权、科、忌分别写入四颗目标星对应的位置，其余十四项为 `None`；不重复维护生产映射表。此数组仅是后续构建 `Star::birth_transformation` 的中间结果，不新增命盘字段，也不处理自化。测试复用独立固定的十干四化样例，逐星验证全部 `10 × 18` 结果，包括无四化的星曜，并检查每个天干恰有四星带四化、每种四化恰出现一次。

自化由 `fn compute_self_transformations(palace_stems: &[Stem; 12], star_branches: &[Branch; 18]) -> [SelfTransformations; 18]` 分配。宫干按寅至丑排列，星曜落宫与输出均按 `StarName::ALL` 排列；本宫宫干四化命中该星为离心，对宫宫干四化命中该星为向心，两者独立保存，也独立于生年四化。函数复用 `compute_transformation_stars`，遍历十二宫各自的四个目标，将结果写入固定数组，不新增查表、字段、关系对象或堆分配。测试使用固定样例验证仅向心、仅离心、两者并存、两者皆无及对宫跨界；再以独立十干四化样例和固定本宫／对宫配对，验证五种宫干排列、十二种紫微落宫、十二月和十二时辰共 `8,640` 种输入的全部十八星。

十八星对象由 crate 内部的 `fn compute_stars(birth_stem: Stem, palace_stems: &[Stem; 12], star_branches: &[Branch; 18]) -> impl ExactSizeIterator<Item = Star>` 生成。传入同一命盘的生年干、按寅至丑排列的宫干，以及按 `StarName::ALL` 排列的落宫地支；迭代器仍严格按 `StarName::ALL` 生成十八颗星曜，不重新计算落宫。生年四化、自化先计算一次，星曜对象在消费时逐颗生成，避免先构造并搬运完整的 `[Star; 18]`；不是延迟生成公开命盘。函数复用生年四化和自化计算，在 `rules.rs` 的组装处通过穷尽匹配提供已确认的类别、星系，调用五参数 `Star::new` 保存完整星曜事实。`Star` 的读取方法与构造器参数保持不变；实例字段布局按 D-237 紧凑化，不把归属推导迁入领域构造器；不新增文件、类型、堆分配，也不组装十二宫。测试通过此入口逐项核对十八星顺序与归属、十干下全部星曜的生年四化，以及固定命盘样例中的向心、离心和无自化情况。

十二宫由 crate 内部的 `fn compute_palaces(palace_names: &[PalaceName; 12], palace_stems: &[Stem; 12], decade_age_ranges: &[DecadeAgeRange; 12], star_branches: &[Branch; 18], stars: impl ExactSizeIterator<Item = Star>) -> [Palace; 12]` 组装。三组宫位数据和输出均按寅至丑排列，星曜及其落宫地支均按 `StarName::ALL` 排列；各参数须来自同一命盘。函数建立十二个空的固定容量集合，消费十八颗星曜的迭代器，以 `try_push` 按地支移入所属宫位，再用 `mem::take` 转移各宫集合。它不统计容量、不分配堆内存、不克隆星曜或重算排盘事实，也不组装 `Natal`。测试以固定命盘核对十二宫的字段和完整星曜名单，覆盖空宫、多星同宫及坐标跨界；再验证甲年顺行、壬年逆行各自的十二月、十二时辰、十二紫微落宫共 `3,456` 种组合，确保每星仅出现一次、落宫正确、宫内顺序稳定，全部星曜事实（含四化）原样保留。

本命盘由 crate 内部的 `fn compute_natal(profile: Profile, resolve_ziwei: impl FnOnce(FiveElementBureau) -> Branch) -> Natal` 统一构建。第二参数只供两条固定的内部路径使用，不作为公开规则扩展入口：`Parameters` 返回给定紫微地支，`Birth` 按五行局和出生日定位紫微。统一路径先计算命身宫、宫干、宫职和五行局，再调用一次定位函数，之后复用大限顺逆、年龄区间、安星和四化规则，通过 `compute_stars`、`compute_palaces` 组装星曜与十二宫。命身宫、宫干及五行局无需在输入衔接层重复计算；闭包静态分发，不装箱或存储。

生肖由生年地支取得；身宫、来因宫、紫微宫的宫职直接从组装后的对应实际宫位读取，随后调用 `Natal::new` 保存事实并建立私有位置索引，星曜与宫位按所有权移入、不克隆。`Profile` 的数字年份与出生日原样保留，无值时不补造；不改变公开领域事实、构造器参数或公开入口的错误契约，不引入中间模型，也不预计算大限、流年的宫职布局。固定命盘验证宫位字段、星曜落宫、生年四化、自化和顶层定位字段；原有 `207,360` 盘组合测试继续覆盖完整命盘不变量。

### `ziwei.rs`

此私有模块定义无字段单元结构体 `Ziwei`，由 crate 根扁平导出；本身不保存命盘事实。它提供 `Ziwei::from_birth(birth: Birth) -> Result<Natal, ZiweiError>` 与 `Ziwei::from_parameters(parameters: Parameters) -> Result<Natal, ZiweiError>`，分别转发至 `rules::compute_natal_from_birth` 和 `rules::compute_natal_from_parameters`；具体规则不迁入此模块。

`compute_natal_from_parameters` 从参数读取性别、生年干支、月份和时辰，构造年份、出生日均为 `None` 的 `Profile`，通过忽略五行局参数的闭包返回输入给定的紫微地支。它不补造日期、不重新定位紫微，也不重复校验已经保证的输入不变量。

`compute_natal_from_birth` 复用 `domain/profile.rs` 的 `sexagenary_from_birth_year` 导出生年干支，将年份与出生日以 `Some(...)` 保存在 `Profile`，再传入调用 `compute_ziwei_branch` 的闭包。年份辅助函数只通过 `domain.rs` 在 crate 内重导出；不公开辅助函数或领域子模块，不将 `Birth` 转成缺少年份与日期的 `Parameters`。两种内部衔接均返回 `Natal`，公开方法保留 D-127 的统一 `Result` 合同，当前没有额外错误分支。引擎不新增年份范围或实际历法日期校验。

现有 `tests/public_api.rs` 验证固定完整命盘、直接参数的 `5,760` 种组合、零年／负年／`i32` 两端的年柱与档案保留，以及十干、两种性别、十二月、十二时辰、三十日共 `86,400` 组两入口对照。紫微预期以逐局扣日、逐宫移动的独立计数基准确定；比较完整宫位与星曜事实，同时明确出生年份和出生日只在 `Birth` 路径有值。输入范围错误仍在值类型构造时验证；两个公开方法的文档示例均由文档测试运行。

## 公共 interface 的规则

在最终入口名称确认前，`ziwei` 的 public interface 必须遵守以下约束：

- 公开输入只有 `Birth` 与 `Parameters`；不以带可选字段的联合输入替代它们。
- crate 根重导出 `Ziwei` 与 `Natal`；公开排盘入口为 `Ziwei::from_birth(Birth)` 与 `Ziwei::from_parameters(Parameters)`，它们均返回 `Result<Natal, ZiweiError>`。
- `Parameters::new` 校验生年干、支必须组成有效六十甲子年柱；地支索引有效不代表任意干支组合有效。成功构造后，排盘入口不再重复校验该不变量。
- 成功构建必须得到统一的 `Natal`；调用方不需要选择规则集或流派。
- `Natal` 通过 `Profile` 保存可选的 `birth_year` 与 `birth_day`，不保留原始输入或输入来源。
- 所有身份使用稳定 enum 或经过校验的值类型，不能让字符串承担干支、星曜、宫名或四化身份。
- 范围错误、无效期间序号等情况以可匹配错误表达，不能依赖错误文案判断；缺少数字年份以 `None` 保留，不作为错误。核心 `Display` 为固定中文诊断。
- 返回的事实及查询结果是只读的；调用方不能通过公开引用破坏 `Natal` 不变量。
- `PalaceName` 是本命、大限与流年共享的唯一十二宫职领域身份；`Palace`、`Decade`、`Yearly` 各自管理该身份在自身期间层级的名称。`StarName` 是稳定星曜身份。`name_hans`、`name_hant` 等本地化字符串仅用于展示，不能反向参与排盘。
- 尚未确认的字段、快照布局、序列化格式、trace 格式和绑定方法名不提前公开。

## 测试与验证布局

### 自动化检查

[GitHub Actions 工作流](../../.github/workflows/ci.yml) 将原生测试与质量检查并行执行，使用 mise 指定工具链，在质量检查中额外验证最低 Rust 版本。每个平台执行 Node 包消费端测试，Rust 打包与基准 smoke 仍只在质量任务执行：

| 检查 | 环境 | 覆盖范围 |
| --- | --- | --- |
| `native-tests` | Ubuntu、macOS、Windows | workspace 全特性的 debug／release 测试；锁定安装 Node 开发依赖，构建适配包并运行 Node 24 集成、类型、Worker 与离线打包消费端测试 |
| `quality` | Ubuntu | 格式、Clippy、Rustdoc、Markdown 示例、Rust 1.98.0 测试、Rust 开发工具的格式／Clippy／记录器／命令行／解包测试、两套基准 smoke、实际打包产物的独立消费端校验 |
| `verify` | Ubuntu | 汇总前两项；失败或跳过均拒绝通过，保留原有检查名称 |

矩阵设置 `fail-fast: false`，一个平台失败不会取消其他平台的诊断。`check:msrv` 用 Rust 1.98.0 验证根 workspace 和独立开发工具，产物分别放入 `target/msrv` 与 `target/msrv/xtask`，不改变默认工具链。根 workspace 的检查不覆盖嵌套工具，后者通过 `check:tools` 单独执行格式、Clippy 和快速测试；真实负载测试默认忽略，通过 `check:tools:e2e` 显式串行执行。`check:msrv` 也显式执行一次端到端测试，两套工具链各覆盖一次真实冒烟，CI 不额外重复同一工具链的 smoke。负载构建遵循 Cargo 目标目录配置，未指定时使用根 `target/`。Node 的远端矩阵尚待实际运行，不代表完整 Node/Wasm 支持已验证。Actions 继续固定完整提交 SHA；mise 的 Rust 缓存按其[官方已知问题](https://github.com/jdx/mise-action/issues/215)关闭。本地 Lefthook 不加入 Node 测试。

基准工具在现有模块内将统计值、命令留证和执行收尾分开：统计采用明确类型，输出时转换为既有 JSON 字段；构建和测量输出先保存后解析，失败写入独立 `failure.json`，不会冒充有效基线。合同指纹排除独立打包检查源码，同时保留完整工具追溯指纹；详细规则见[基准说明](../engineering/benchmarks.md)。

`mise run check:package` 先运行 `cargo package --locked`，再从本轮生成的 `.crate` 解包到临时目录，以独立 Cargo workspace 通过 path 依赖消费打包内容。复用包内 `public_api`、`queries`、`fixtures` 三组公开测试，在 debug／release 下各运行一次，并执行包内 `inspect` 示例；消费端不读取工作树源码。Rust 工具仅解包预期包目录下的普通文件和目录，拒绝越界路径、链接、特殊文件及重复覆盖。归档哈希、消费端 lockfile、命令和退出码记录到 `target/package-checks/<记录 ID>/result.json`，失败也保留记录；临时消费端通过 RAII 清理，不发布。仅本地未提交验证可以显式加 `--allow-dirty`。

`cargo test` 会运行源码内的 doctest，不会自动执行独立 Markdown 文件。CI 显式编译并运行 README 与本文中的 Rust 代码块；在仓库根目录可复跑：

```sh
mise exec -- cargo build -p ziwei --locked
mise exec -- rustdoc --edition 2024 --test README.md --extern ziwei=target/debug/libziwei.rlib -L dependency=target/debug/deps
mise exec -- rustdoc --edition 2024 --test docs/architecture/rust-package-design.md --extern ziwei=target/debug/libziwei.rlib -L dependency=target/debug/deps
```

历史方案中的 `rust,ignore` 示例明确跳过，不代表当前 API。共享 runner 的 smoke 只验证负载可执行，不作为速度提升或性能回归的证据。远端是否通过须以对应提交的实际运行结果为准，不能以工作流文件或本地测试代替。

### 核心库

每条已经确认的公开行为先以 `ziwei/tests/` 下的集成测试表达，再实现最小纵切片。集成测试只跨 crate 根的公共 seam，不检查私有规则模块的文件结构。

私有单元测试可验证公式边界、固定规则表、数组顺序和算术安全性。测试名使用 `CONTEXT.md` 的领域术语，表驱动数据记录来源和预期事实。

`Natal::decade` 在现有 `tests/public_api.rs` 中验证，不新增测试文件。固定布局覆盖阳男、阴女顺行及阴男、阳女逆行；以独立的固定布局旋转基准覆盖两种创建入口、十二个命宫位置与全部十二个大限序号，共 `1,152` 组结果，并核对既有大限年龄区间和本命事实不变。无效序号由 `DecadeIndex` 拒绝，公开文档示例作为 doctest 运行。

`Natal::decade_years` 在同一公开测试文件中验证：固定十项年龄与年份捕捉虚岁偏移错误；五种五行局、两种性别、两种入口及全部十二大限覆盖 `240` 组摘要、`2,400` 项年度。另覆盖数字年份跨零、`i32::MIN`／`i32::MAX` 下的首末大限、超出 `i32` 仍保留 `Some(i64)`、缺少出生年份保持 `None`、与既有年龄区间一致、重复查询和本命事实不变。无效序号继续在 `DecadeIndex` 转换处拒绝，文档调用示例作为 doctest 运行。

`Natal::yearly` 同样在 `tests/public_api.rs` 验证，不新增测试文件。固定完整布局验证逆布顺序与名称；逐年旋转基准覆盖十二生年支、十二月份、两种性别、两种创建入口和全部期间序号，共 `69,120` 组布局，并断言每个生年支都覆盖五种五行局。另以固定流命地支核验最大虚岁 `125`、归一化前数值超过 `i8::MAX`、零年及 `i32` 两端边界；查询不改变本命事实。无效大限与流年序号均在值类型转换处拒绝，公开示例作为 doctest 运行。

`Palace`、`Decade` 与 `Yearly` 的单元测试必须分别以表驱动形式覆盖十二个本命宫职、大限宫职、流年宫职的 `name_hans`／`name_hant`。`Star` 继续覆盖全部已支持名称与简称。名称测试只固定展示合同，不重复验证排盘规则。

```text
crates/ziwei/
├── src/
│   └── ...
├── tests/
│   ├── public_api.rs                 # 输入、本命、期间的公共接口
│   ├── queries.rs                    # 星曜及四化借用、关系查询
│   ├── fixtures.rs                   # 静态命例断言
│   └── fixtures/                     # 随包分发的样例与推导说明
├── examples/inspect.rs               # 可运行的完整调用示例
└── benches/                         # construction.rs + suite.rs
```

### 共享命例

当前静态命例放在 `crates/ziwei/tests/fixtures/`，随 crate 一起分发，通过 `include_str!` 编译进测试，不由运行时读取。手算甲子火六局样例的输入、推导和证据边界见该目录的 README；不宣称外部专家审定。原有壬申完整样例保留在 `public_api.rs`。新增 fixture 必须说明规则来源和适用项目口径。

甲子 CSV 的文本预期显式映射到 `StarName` 与 `Branch` 枚举，不通过被测 `ALL` 数组推导身份。另有五种五行局各取初一、三十的十组手算定位锚点，经两条公开入口分别断言命宫干支、五行局、紫微与天府；覆盖零补数、奇数补数和偶数补数。锚点及推导见 [样例说明](../../crates/ziwei/tests/fixtures/README.md)，不是由引擎导出的快照，也不冒充十张完整命例或外部专家审定。

`fixtures.rs` 还保存丁卯男命五月酉时、辛酉女命十一月丑时的两张完整手算预期；两种入口分别验证十二宫、十八星、生年与两向自化、四十八条宫干四化、第二大限和末个流年的完整宫职及十项年度摘要。四化目标落宫由静态样例表读取，不从命盘输出推导；推导与证据边界同见样例说明。

全盘星曜与四化查询已于 2026-09-07 逐项确认，见 D-228、D-229；内部定位按 D-238 改用构造时一次建立的私有位置索引。`Natal::star(StarName)` 返回 `&Star`，`Natal::palace_by_star(StarName)` 返回所在宫位的 `&Palace`，均直接索引；宫位查询命名与 `palace`、`palace_by_name` 对齐。生年四化按十干表选择目标，返回按 A/B/C/D 排列的四项宫位／星曜借用。自化仍按宫序、星序遍历，同星双向只返回一项。宫干四化接收实际地支 `Branch`，转发至 `rules.rs` 选择四星并直接定位，关系值类型仍归 `domain/transformation.rs`，返回固定数组；不再临时扫描全盘建立落宫表。不为单个查询新增模块或查询结果缓存，不改变本命事实，同宫四化保留。

### Adapter

每个 adapter 在自己的包中维护端到端测试：同一命例经 JavaScript/Wasm 输入后，应得到与核心相同的领域事实和稳定错误代码。adapter 测试不能把绑定层的序列化细节反向变成核心库的约束。

## 性能与依赖策略

- `ziwei` 当前唯一第三方运行依赖为关闭默认特性的 `arrayvec`（锁定验证版本 0.7.8），不暴露其类型；自有源码禁止 unsafe，依赖内部 unsafe 由其封装。其他新依赖仍须直接改善已测量的正确性、兼容性或性能。
- 本命构建与查询优先使用固定大小、稳定顺序的数据结构；动态分配或缓存必须有基准证据。
- 大限与流年按需计算；核心暂不缓存。需要缓存时由上层或 adapter 根据其生命周期和容量约束实现。
- 基准测试只在有已确认的命例语料、工作负载和目标环境后引入；不能用尚未验证的“极快”作为提前优化的理由。
- Cargo feature 必须是可叠加的真实可选能力，不能用 feature 选择流派、改变排盘规则或在 Node/Wasm 间切换领域行为。

现有建盘基准合同、记录器、正式基线门槛及 CI smoke 范围见 [基准说明](../engineering/benchmarks.md)。本轮仅有未提交工作树的临时校准，不能称为正式性能基线；不依据这些数据随意改动已确认的领域结构。跨语言值域、缺失值和借用边界见 [适配合同](adapter-contract.md)，并不提前冻结绑定 wire format。

## 拆包门槛

下列条件同时满足前，不新增 Cargo 包：

1. 新模块面对不同运行时、不同工具链、不同发布周期，具有与排盘规则单向隔离的展示／适配边界，或确有第二种实现。
2. 它能依赖 `ziwei` 而不要求核心反向依赖它。
3. 它有独立的 interface、测试和交付物，不只是重导出或转发。
4. 拆分后调用方需要了解的知识不会增加；复杂性会留在新模块内部。

| 候选包 | 允许创建的条件 | 依赖方向 |
| --- | --- | --- |
| `ziwei-napi` | 核心构建、查询、快照和错误合同已稳定，且开始交付 Node 包 | `ziwei-napi -> ziwei` |
| `ziwei-wasm` | 核心合同已稳定，且开始交付浏览器/Wasm 产物 | `ziwei-wasm -> ziwei` |
| `ziwei-calendar` | 项目明确纳入历法换算，并能作为向 `Birth` 提供资料的独立能力 | 可依赖 `ziwei` 的输入类型；核心不得依赖它 |
| `ziwei-analysis` | 项目明确纳入解释/断语，并确认其独立语义与安全界限 | `ziwei-analysis -> ziwei` |

## 与归档 Rust 结构的关系

归档 Rust 曾拆为 `ziwei_core`、`ziwei_query`、`ziwei` 门面、`ziwei_calendar` 与 `ziwei_analysis`。新设计逐项处理如下：

| 归档包 | 新设计 | 原因 |
| --- | --- | --- |
| `ziwei_core` | 重命名并重建为 `ziwei` | 它是直接面向 Rust 使用者的完整领域引擎，不再以 `_core` 暗示额外门面。 |
| `ziwei_query` | 并入 `ziwei` | 查询只借用同一张命盘，没有独立运行时或实现变体。 |
| `ziwei` 门面 | 不单独重建 | 当前 `ziwei` 已是完整引擎，额外纯重导出包是浅模块。 |
| `ziwei_calendar` | 不创建 | 历法换算明确在引擎外。 |
| `ziwei_analysis` | 不创建 | V1 不做解释或断语。 |

归档结构是交叉参考，不是权威。新代码以本仓库已确认的领域规则、public interface 测试和本文件的依赖约束为准。

## 实施顺序

1. 完成 workspace 与 `ziwei` 工具链校验。
2. 在 crate 根确认第一条构建 interface，并写第一条公共集成测试。
3. 按纵切片实现稳定身份与两类输入。
4. 实现最小 `Natal` 构建，再逐步加入宫位、星曜、四化与自化。
5. 在核心中加入按需大限、流年和只读查询。
6. 以固定命例、错误合同和基准验证核心 interface。
7. 仅在 Node/Wasm 交付开始时创建对应 adapter 包。

每一步都必须保持依赖方向、`Natal` 不变量和已通过的公共测试；不以一次性重构替代纵切片。
