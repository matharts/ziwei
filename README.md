<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/ziwei-banner-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/ziwei-banner-light.png">
  <img alt="Ziwei — 紫微斗数排盘引擎" src="assets/ziwei-banner-light.png" width="100%">
</picture>

<p align="center">
  <strong>输入农历出生资料，查询宫位、星曜与四化。</strong><br>
  为 Rust 应用提供不可变的结构化命盘。
</p>

<p align="center">
  <a href="#范围"><img alt="Status: development" src="https://badges.ws/badge/status-development-D99A23?labelColor=000000&amp;style=flat-square"></a>
  <a href="https://github.com/matharts/ziwei/actions/workflows/ci.yml"><img alt="CI" src="https://badges.ws/github/workflow/matharts/ziwei/ci.yml?label=CI&amp;labelColor=000000&amp;style=flat-square"></a>
  <a href="Cargo.toml"><img alt="Rust 1.98+" src="https://badges.ws/badge/Rust-1.98%2B-DEA584?labelColor=000000&amp;style=flat-square"></a>
  <a href="https://github.com/matharts/ziwei/commits/main"><img alt="Last commit" src="https://badges.ws/github/last-commit/matharts/ziwei?label=last%20commit&amp;labelColor=000000&amp;style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT" src="https://badges.ws/badge/license-MIT-007EC6?labelColor=000000&amp;style=flat-square"></a>
</p>

<p align="center">
  <a href="#安装">安装</a> &nbsp; / &nbsp;
  <a href="#使用">使用</a> &nbsp; / &nbsp;
  <a href="#调用约定">调用约定</a> &nbsp; / &nbsp;
  <a href="#进阶用法">进阶用法</a> &nbsp; / &nbsp;
  <a href="#范围">范围</a> &nbsp; / &nbsp;
  <a href="#阅读指南">阅读指南</a>
</p>

> [!NOTE]
> **开发中** · 当前通过 Git 接入开发版本，接口与功能仍可能调整。

Rust 接入从下方安装与示例开始；Node.js / TypeScript 接入见 [Node 包说明](packages/ziwei/README.md)。当前实现与待交付内容见[范围](#范围)，领域、架构与开发文档见[阅读指南](#阅读指南)。

## 安装

需要 **Rust 1.98+**。在你的 Rust 项目目录执行：

```sh
cargo add ziwei --git https://github.com/matharts/ziwei.git
```

<details>
<summary>还没有项目？从这里开始</summary>

在准备存放代码的目录执行：

```sh
cargo new --bin ziwei-demo
cd ziwei-demo
cargo add ziwei --git https://github.com/matharts/ziwei.git
```

完成后留在 `ziwei-demo` 目录，继续下方示例。

</details>

<details>
<summary>使用 Cargo.toml 或固定提交</summary>

也可在 `Cargo.toml` 中直接声明：

```toml
[dependencies]
ziwei = { git = "https://github.com/matharts/ziwei.git" }
```

应用项目应保留 `Cargo.lock`，记录实际使用的提交。需要在依赖声明中固定提交时，为安装命令追加 `--rev <提交哈希>`，替换为实际提交哈希。

</details>

## 使用

**建盘 → 查询 → 输出**。将项目的 `src/main.rs` 替换为以下完整示例：

```rust
use ziwei::{Birth, BirthDay, BirthMonth, Branch, Gender, StarName, Ziwei};

fn main() -> Result<(), ziwei::ZiweiError> {
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8)?,
        birth_day: BirthDay::try_from(17)?,
        birth_hour: Branch::Mao, // 卯时
    })?;

    let palace = natal.palace_by_star(StarName::ZiWei);
    println!("紫微落宫：{}", palace.branch());

    Ok(())
}
```

在项目目录运行：

```sh
cargo run --quiet
# 输出：紫微落宫：酉
```

修改 `Birth` 的五个字段即可更换出生资料。此例为女性、农历 1992 年八月十七、卯时；公历转换和闰月处理需在传入前完成。

<details>
<summary>只想试运行，不创建新项目</summary>

克隆仓库并运行自带示例：

```sh
git clone https://github.com/matharts/ziwei.git
cd ziwei
cargo run --quiet -p ziwei --example inspect
```

该示例输出紫微落宫、流年宫职及宫干四化。出生资料可在 [inspect.rs](crates/ziwei/examples/inspect.rs) 中修改。

</details>

## 调用约定

接入时先确认以下约定，再选择所需查询：

| 约定 | 调用方需要知道的内容 |
| --- | --- |
| 输入归一化 | 历法换算、闰月处理、时区、真太阳时与真实日期校验由调用方在建盘前完成；月份与日期类型只校验数值范围。完整边界见 [领域规则](CONTEXT.md)。 |
| 数组顺序 | 命盘与期间宫职数组按寅至丑排列，`Branch::ALL` 按子至亥排列，不能直接混用下标；定位时优先使用按地支、宫职或星曜查询的方法。 |
| 本命事实与期间宫职 | 按期间宫职定位得到的 `Palace` 仍保存本命宫职、宫干与星曜。读取整盘期间宫职用 `decade()` / `yearly()`；`decade_by_branch()` / `yearly_by_branch()` 返回单宫的独立 `Decade` / `Yearly` 值及对应期间名称。 |
| 所有权与计算 | Rust 本命盘保持不可变，宫位与星曜查询借用当前命盘；大限与流年按需计算。Node 输出为独立只读数据，属性复用与查询结果的引用约定见 [Node 所有权合同](docs/architecture/node-api-design.md#6-所有权只读与快照复用)。 |

## 进阶用法

本命盘建立后保持不可变，大限与流年按需计算。

<details>
<summary>继续查询大限与流年</summary>

以下为可独立运行的完整示例，可替换项目的 `src/main.rs`：

```rust
use ziwei::{Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, PalaceName, Transformation, YearlyIndex, Ziwei};

fn main() -> Result<(), ziwei::ZiweiError> {
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8)?,
        birth_day: BirthDay::try_from(17)?,
        birth_hour: Branch::Mao,
    })?;

    // 指定一种宫干四化；查全部四化则调用 palace_transformations。
    let lu = natal.palace_transformation(Branch::Zi, Transformation::A);
    assert_eq!(lu.source_branch(), Branch::Zi);
    assert_eq!(lu.target_branch(), Branch::Zi);

    let decade = DecadeIndex::try_from(0)?; // 第一大限
    let yearly = natal.yearly(decade, YearlyIndex::try_from(0)?);
    let years = natal.decade_years(decade);

    for (palace, role) in natal.palaces().iter().zip(yearly) {
        println!("{} {}", palace.branch(), role.name_hant());
    }
    assert_eq!(years[0].year(), Some(1993));

    // 直接定位流年财帛宫，再读取该实际宫位的本命事实。
    let wealth = natal.yearly_palace_by_name(decade, YearlyIndex::try_from(0)?, PalaceName::CaiBo);
    for relation in natal.palace_transformation_sources(wealth.branch()) {
        println!("{} -> {}", relation.source_branch(), relation.target_branch());
    }
    if let Some((decade, yearly)) = natal.period_indices_at_age(35) {
        let role = natal.yearly_by_branch(decade, yearly, Branch::Shen);
        println!("申宫在该流年的宫职：{}", role.name_hans());
    }
    assert_eq!(natal.opposite_palace(Branch::Shen).branch(), Branch::Yin);
    // false 查询三方；true 再加入本宫，与四正查询一致。
    assert!(natal.sanfang_palaces(Branch::Yin, false)
        .map(|palace| palace.branch()).eq([Branch::Wu, Branch::Xu, Branch::Shen]));
    assert_eq!(natal.sizheng_palaces(Branch::Yin).map(|palace| palace.branch()),
        [Branch::Yin, Branch::Wu, Branch::Xu, Branch::Shen]);
    Ok(())
}
```

</details>

<details>
<summary>更多查询：宫位、星曜、四化与索引约定</summary>

两种建盘入口均返回 `Natal`。所有公开类型均从 crate 根导入。

| 查询内容 | 接口 |
| --- | --- |
| 建立本命盘 | `Ziwei::from_birth` / `Ziwei::from_parameters` |
| 宫位 | `Natal::palaces` / `palace` / `palace_by_name` |
| 命、身、来因、紫微所在宫 | `ming_palace` / `shen_palace` / `origin_palace` / `ziwei_palace` |
| 星曜与落宫 | `Natal::star` / `palace_by_star`，宫内可用 `Palace::star` |
| 生年四化与自化 | `Natal::birth_transformations` / `self_transformations` |
| 宫干四化 | `Natal::palace_transformations(source_branch)` |
| 单项宫干四化 | `Natal::palace_transformation(source_branch, kind)` |
| 某宫的四化来源 | `Natal::palace_transformation_sources(target_branch)` |
| 大限与流年 | `Natal::decade` / `decade_years` / `yearly` |
| 期间宫职定位 | `Natal::decade_palace_by_name(decade, name)` / `yearly_palace_by_name(decade, yearly, name)` |
| 按实际地支读期间宫职 | `Natal::decade_by_branch(decade, branch)` / `yearly_by_branch(decade, yearly, branch)` |
| 虚岁定位期间 | `Natal::period_indices_at_age(age)` |
| 本命对宫 | `Natal::opposite_palace(branch)` |
| 三方／可包含本宫 | `Natal::sanfang_palaces(branch, include_self)` |
| 四正 | `Natal::sizheng_palaces(branch)` |

- **三方四正顺序**：三方按相对本宫顺移四宫、八宫、六宫（对宫）排列；`include_self = true` 时先返回本宫，组成四正。四正方法固定返回同序的四项借用。
- **期间索引**：大限序号为 `0..=11`，大限内流年序号为 `0..=9`。
- **虚岁查询**：五行局数为 `b` 时支持 `b..=b + 119`，返回 `(大限序号, 流年序号)`；其余 `u8` 输入返回 `None`，不进行周岁或日期换算。
- **四化反查**：按源宫寅至丑、各源宫 A/B/C/D 顺序返回命中关系；保留同宫关系，无命中时迭代器为空。
- **干支建盘**：通过 `Parameters::new` 与 `Ziwei::from_parameters` 指定生年干支和紫微落宫，无需提供数字出生年份或出生日。此时年度摘要包含虚岁，数字年份为 `None`。

</details>

## 范围

- **已支持**：十八星安星、宫位与星曜查询、生年四化、自化、宫干四化、大限与流年。
- **Node.js / TypeScript**：[适配包](packages/ziwei/README.md)已实现已确认的完整 API：两类建盘、本命数据与查询、四化、按需大限／流年、身份派生方法、结构化错误及 JSON 输出；本机验证通过，跨平台验收与发布未完成。
- **后续计划**：Node 跨平台验收与发布流程、Wasm 绑定。
- **当前不包含**：解释与断语、连续飞化、流月、流日、流时。

<details>
<summary>排盘规则与集成边界</summary>

排盘采用统一的项目规则，其中壬干化科取左辅。接入边界见上方[调用约定](#调用约定)，完整术语与不变量见 [领域规则](CONTEXT.md)。

核心使用 `std`，唯一第三方运行依赖为关闭默认特性的 `arrayvec`。自有源码禁止 `unsafe`；ArrayVec 内部封装了 `unsafe`。

</details>

## 阅读指南

| 你要做什么 | 从哪里开始 |
| --- | --- |
| 接入 Rust 或 Node | 本页[使用示例](#使用)；[Node 包说明](packages/ziwei/README.md) |
| 理解领域术语与规则 | [CONTEXT.md](CONTEXT.md)：输入、本命事实、限运与核心不变量 |
| 阅读核心与绑定源码 | [架构阅读路径](docs/architecture/rust-package-design.md#阅读路径)：从公开入口跟到计算与查询 |
| 核对 Node 的类型、查询与对象行为 | [Node 适配设计](docs/architecture/node-api-design.md#阅读路径) |
| 修改项目并验证 | [仓库指南](AGENTS.md)与[工程验证](docs/agents/engineering.md)；性能任务另见[基准规范](docs/engineering/benchmarks.md) |
| 追溯设计原因与修订 | [V1 决策表](docs/architecture/v1-decision-map.md)：按修订关系阅读历史条目 |

## License

[MIT](LICENSE)
