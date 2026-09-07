# Ziwei

使用 Rust 实现的紫微斗数排盘引擎。当前核心支持十八星本命盘，以及按需生成的大限、流年；采用项目唯一规则，壬干化科为左辅。

## 使用

当前为本地开发中的 `0.1.0`，不表示已经发布到 crates.io。工作区内可使用 path 依赖：

```toml
[dependencies]
ziwei = { path = "../ziwei/crates/ziwei" }
```

```rust
use ziwei::{Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, StarName, YearlyIndex, Ziwei};

fn main() -> Result<(), ziwei::ZiweiError> {
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8)?,
        birth_day: BirthDay::try_from(17)?,
        birth_hour: Branch::Mao,
    })?;

    let ziwei = natal.star(StarName::ZiWei);
    let palace = natal.palace_by_star(StarName::ZiWei);
    println!("{}: {} / {}", palace.branch(), ziwei.name_hans(), ziwei.name_hant());

    let decade = DecadeIndex::try_from(0)?; // 第一大限
    let yearly = natal.yearly(decade, YearlyIndex::try_from(0)?);
    let years = natal.decade_years(decade);
    for (palace, role) in natal.palaces().iter().zip(yearly) {
        println!("{} {}", palace.branch(), role.name_hant());
    }
    assert_eq!(years[0].year(), Some(1993));
    Ok(())
}
```

直接指定生年干支与紫微落宫时，用 `Parameters::new` 和 `Ziwei::from_parameters`。这一路径不要求数字出生年份或出生日，因此年度摘要仍有虚岁，数字年份为 `None`。

公开入口与查询：

| 需求 | 接口 |
| --- | --- |
| 建立本命盘 | `Ziwei::from_birth` / `Ziwei::from_parameters` |
| 宫位读取 | `Natal::palaces` / `palace` / `palace_by_name` |
| 命、身、来因、紫微所在宫 | `ming_palace` / `shen_palace` / `origin_palace` / `ziwei_palace` |
| 星曜与落宫 | `Natal::star` / `palace_by_star`，宫内可用 `Palace::star` |
| 生年四化与自化 | `Natal::birth_transformations` / `self_transformations` |
| 宫干四化 | `Natal::palace_transformations(source_branch)` |
| 按需期间计算 | `Natal::decade` / `decade_years` / `yearly` |

命盘与期间宫职数组均按**寅至丑**排列；`Branch::ALL` 则按**子至亥**排列，不能直接混用下标。大限序号为 `0..=11`，大限内流年序号为 `0..=9`。

## 当前设计

工作区只有 `ziwei` 一个 Rust 包，公开类型均从 crate 根导入。两条创建方法共享统一本命计算路径，返回完整、不可变的 `Natal`；`ziwei.rs` 只承载入口，具体计算放在私有 `rules.rs`，领域对象位于私有 `domain/`。

宫内星曜使用固定容量内联存储，对外仍是 `&[Star]`。`Natal` 在构造时建立私有位置索引，查星与查落宫借用当前命盘，无需重新扫描全盘；名称和简称通过现有 getter 读取静态资料。宫干四化、大限和流年按需生成，不预存查询结果。

完整模块职责、对象所有权和计算过程见 [包架构](docs/architecture/rust-package-design.md) 与 [架构图](docs/architecture/ziwei-architecture.html)。这些内部表示不构成跨语言 ABI，也不要求调用方改变 import 或使用方式。

## 范围

核心使用 `std`，唯一第三方运行依赖为关闭默认特性的 `arrayvec`，用于私有固定容量星曜存储。自有源码禁止 `unsafe`；ArrayVec 内部封装了 `unsafe`，不承诺整个依赖树没有 `unsafe`。不处理历法、闰月、时区、真太阳时或真实日期校验；调用方提供已经换算的紫微斗数出生资料。不提供解释、断语、连续飞化、流月、流日或流时。Node.js/TypeScript 与 Wasm 绑定留待后续交付。

## 开发与验证

```sh
mise install
mise exec -- cargo test --workspace
mise exec -- cargo clippy --workspace --all-targets --all-features -- -D warnings
mise exec -- cargo fmt --all -- --check
mise exec -- cargo doc --no-deps
mise exec -- cargo run -p ziwei --example inspect
mise run benchmark:smoke
mise run benchmark:calibrate -- --runs 20
mise run benchmark:read:smoke
mise run check:msrv
mise run check:package
```

[CI](.github/workflows/ci.yml) 配置了 Linux、macOS、Windows 三个平台的 debug／release 测试；格式、Clippy、Rustdoc、Markdown 示例、基准 smoke 和包校验只在 Ubuntu 执行一次。`verify` 汇总全部结果，任一必需检查失败或跳过都不会通过。检查范围与 Markdown 示例的本地复跑命令见 [验证布局](docs/architecture/rust-package-design.md#自动化检查)。平台矩阵的配置不代表远端已经通过。

工程脚本使用本机 Python 标准库，打包消费端校验要求 Python 3.12+，不是核心库依赖。未提交工作树可显式运行 `mise run check:package -- --allow-dirty`；CI 不放宽该检查。性能数据与比较限制见 [基准说明](docs/engineering/benchmarks.md)；跨语言语义见 [适配合同](docs/architecture/adapter-contract.md)。

领域规则见 [CONTEXT.md](CONTEXT.md)，设计历史见 [决策记录](docs/architecture/v1-decision-map.md)。目前不应把“所有测试通过”理解为专家审定、跨平台 CI 已运行或正式发布完成。
