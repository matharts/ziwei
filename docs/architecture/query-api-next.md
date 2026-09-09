# 虚岁、期间宫职与对宫查询

状态：2026-09-08，用户已确认并授权执行，四项查询已实现。对应决策为 D-242～D-244；后续候选仍未定稿。

本次增加四个 `Natal` 方法：虚岁定位期间、按实际宫位读取大限／流年宫职、查询对宫。前三个支持“选择虚岁 → 点击实际宫位 → 显示期间宫职”的流程，对宫查询用于读取该宫对面的本命事实。

此前基线为 [D-240、D-241](v1-decision-map.md)：已提供期间宫职到实际宫位的定位，以及按目标宫反查宫干四化。事实归属沿用 [CONTEXT.md](../../CONTEXT.md) 与 [包架构](rust-package-design.md)。以下合同基于项目既有规则，不是新引入的外部术数标准。

## 公开接口

以下签名均属于 `impl Natal`：

```text
period_indices_at_age(&self, age: u8) -> Option<(DecadeIndex, YearlyIndex)>
decade_by_branch(&self, decade: DecadeIndex, branch: Branch) -> Decade
yearly_by_branch(&self, decade: DecadeIndex, yearly: YearlyIndex, branch: Branch) -> Yearly
opposite_palace(&self, branch: Branch) -> &Palace
```

| 接口 | 具体问题 | 返回语义 |
| --- | --- | --- |
| `period_indices_at_age` | 虚岁 35 对应哪个大限及其第几年？ | 一对经过校验的零基序号；不在本盘支持区间时为 `None` |
| `decade_by_branch` | 申宫在第二大限是什么宫职？ | 按需计算的单个 `Decade`，可读取 `name()`、简繁名称 |
| `yearly_by_branch` | 申宫在选定流年是什么宫职？ | 按需计算的单个 `Yearly`，可读取 `name()`、简繁名称 |
| `opposite_palace` | 当前实际宫位的对宫有哪些星曜？ | 本盘对宫的 `&Palace`，不复制星曜 |

## 1. 虚岁定位期间

已确认合同如下：

- `age` 是调用方已确定的虚岁，不是周岁，也不是数字年份；此查询不计算日期或历法。
- `u8` 的全部输入均可查询。`0` 和起限前的年龄返回 `None`，含义是没有匹配期间，不是替调用方校验年龄是否合法。
- 设五行局数为 `b`，有效年龄区间为闭区间 `[b, b + 119]`。每张盘只支持十二大限，不循环、不延伸至第十三大限。
- 区间内设 `offset = age - b`，返回大限序号 `offset / 10` 与大限内流年序号 `offset % 10`。
- 两种建盘入口均支持，不依赖 `Profile::birth_year()`，不受大限顺逆影响。
- 返回元组顺序固定为 `(DecadeIndex, YearlyIndex)`，与既有 `yearly(decade, yearly)` 参数顺序一致。暂不新增 `Period` 或期间选择对象。

边界示例：

| 五行局 | 输入虚岁 | 返回序号 |
| --- | --- | --- |
| 水二 | 0、1 | `None` |
| 水二 | 2 | `(0, 0)` |
| 水二 | 11 | `(0, 9)` |
| 水二 | 12 | `(1, 0)` |
| 水二 | 121 | `(11, 9)` |
| 水二 | 122、255 | `None` |
| 火六 | 5 | `None` |
| 火六 | 6 | `(0, 0)` |
| 火六 | 35 | `(2, 9)` |
| 火六 | 125 | `(11, 9)` |
| 火六 | 126 | `None` |

选择 `Option` 是因为本查询回答“有无匹配期间”。如果调用方未来需要区分“年龄无效、起限前、超出覆盖”，应重新讨论类型化结果；本次不新增错误变体，也不通过错误字符串区分。

实现使用 `checked_sub` 检查下界，再检查 `offset < 120`，通过既有 `TryFrom<u8>` 构造有效索引。禁止截断、饱和到第一／最后期间或先转有符号窄整数。直接计算索引，不遍历十二宫的年龄区间、不生成十项年度摘要。

## 2. 按实际宫位读取期间宫职

`decade_by_branch` 和 `yearly_by_branch` 分别与已有的 `decade_palace_by_name`、`yearly_palace_by_name` 构成双向查询：

```text
指定期间的 PalaceName → 实际 Palace
实际 Branch → 指定期间的 Decade / Yearly
```

返回现有 `Decade` / `Yearly` 值：调用方既能比较宫职身份，也能直接读取“大财”“流财”等期间名称，名称职责继续留在对应对象中。

- 入参全是已验证的值类型，所有组合均存在结果，不返回 `Option` 或 `Result`。
- 按值返回临时计算的期间宫职，不能返回借用，因为 `Natal` 中不存储期间布局。
- 不向 `Palace` 写入期间宫职，不为 `Decade` / `Yearly` 增加地支、年份、序号字段。
- 两种建盘入口均支持，数字年份的有无不影响查询。
- 复用当前规则层的期间命宫定位，并与完整布局共用“实际地支 → 宫职”计算，避免出现两套偏移公式。
- 直接产生一项结果，不先生成 `[Decade; 12]` / `[Yearly; 12]` 再取下标。

固定命例：沿用 [手算样例](../../crates/ziwei/tests/fixtures/README.md) 的丁卯男命，第二大限大命在申，则 `decade_by_branch(1, Shen)` 返回宫职 `Ming`、名称“大命”；同一大限第十流年的流命在寅，`yearly_by_branch(1, 9, Yin)` 返回宫职 `Ming`、名称“流命”。这里的数字是说明用序号，实现时使用相应索引类型。

如果调用方要绘制整张盘，仍使用已有数组查询一次取得十二项。单宫方法面向局部读取，不鼓励将十二次单宫调用当作整盘查询的替代。

## 3. 对宫查询

`opposite_palace(branch)` 返回实际地支相隔六宫的本命宫位。例如寅对申、卯对酉、子对午；不随本命、大限或流年的宫职名称变化。

参数使用 `Branch`，不接收可能来自另一张盘的 `&Palace`。返回当前 `Natal` 内的借用，不返回期间对象，不附加吉凶或会照解释。

实现只需固定偏移和索引，不扫描星曜、不预存对宫表，也不需要通用宫位偏移接口。复用既有地支坐标约定，明确 `Branch::ALL` 从子开始、`palaces()` 从寅开始，避免混用下标。

## 组合使用

以下为调用形态，`natal` 是已建立的本命盘：

```text
let Some((decade, yearly)) = natal.period_indices_at_age(35) else {
    // 调用方展示：此虚岁不在本盘支持的期间范围内。
    return;
};
let palace = natal.palace(Branch::Shen);
let decade_role = natal.decade_by_branch(decade, palace.branch());
let yearly_role = natal.yearly_by_branch(decade, yearly, palace.branch());
let opposite = natal.opposite_palace(palace.branch());
```

本命名称读取 `palace.name_hans()`，大限和流年名称分别读取两个期间对象的 `name_hans()`。这些查询只读同一张盘，彼此不依赖缓存，也不改变星曜或四化事实。

## 性能与验收

四项接口均使用常数次数值运算和直接索引，无堆分配、不复制本命宫位、不缓存查询结果。这里是算法和资源约束，不是已测得的延迟结论；未增加 `inline(always)`、静态查表或新的持久索引。

验收范围：

1. 五种局的起限前、首年、十年交界、末年和范围外年龄；遍历 `u8` 输入时均不溢出。固定年龄例与现有年度摘要的一致性分开验证。
2. 用丁卯男与辛酉女的固定命例确认期间宫职；再覆盖两入口、顺逆、全部合法期间和十二地支，与完整布局及已实现的反向定位互相核对。
3. 显式列出六组对宫配对，并验证取两次对宫返回原宫位的同一借用；查询后本命事实保持不变。
4. 按项目工程入口验证测试、格式、Clippy、Rustdoc、MSRV 和适用消费端检查。若报告延迟，单独定义新查询负载并遵循基准规范，不把旧套件的数字用作新方法的性能证据。

## 本地验证结果

本轮本地验证通过：Debug／Release 核心测试（各 112 项，含 13 项 doctest）、全部目标 Clippy、Rustdoc 警告检查、Rustfmt、README 与架构文档示例、`check:msrv`。`check:package -- --allow-dirty` 验证了包含当前未提交改动的实际打包产物，独立消费端 Debug／Release 测试及 `inspect` 示例通过。架构文档中原有的一个历史实验示例保持忽略。未采集新增查询的延迟基准，未提交、推送或发布，未验证远端 CI。

## 后续候选

- **按数字年份定位期间**：需要区分缺少出生年份与超出期间范围，并确定输入年份口径、宽整数减法及返回类型。先由年龄接口承担核心映射，不把数字年份当作公历日期。
- **三方四正**：已在后续请求中实现，见 D-246。`sanfang_palaces(branch, include_self)` 以参数控制本宫，`sizheng_palaces(branch)` 固定返回四正；不含本宫为偏移 `[4, 8, 6]`，含本宫为 `[0, 4, 8, 6]`，沿地支正序计数。均借用既有宫位，不新增具名结果类型。
- **单项生年四化、两宫之间的四化筛选**：当前已有固定四项结果与惰性过滤，待实际调用重复出现后再判断是否值得新增方法。
- **连续飞化、解释、计算追踪**：继续遵循已有延期决策，本次不重开。

后续候选需要单独定稿，本次实现范围仅为上列四项公开接口。
