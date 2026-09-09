# Rust 核心与未来绑定的语义合同

本文件冻结现有核心能保证的值域、顺序、缺失值、错误及所有权语义；它本身不定义 JSON 格式、TypeScript 类型或 C ABI。Node.js/TypeScript 的完整合同见 [Node 适配设计](node-api-design.md) 与 [设计声明](node-api/index.d.ts)（D-248～D-251）。D-253、D-255、D-256 已实现 [完整 Node API](../../packages/ziwei/README.md)：两类建盘、本命数据与查询、四化、按需限运、身份辅助与 `toJSON`；实际生成声明和完整设计逐项匹配。仍未发布，跨平台矩阵未完成验收。Wasm 实施应继续保持这里的核心语义，不能用宿主表示反向改写核心。

## 输入边界

| 核心值 | 值域和含义 | 适配层要求 |
| --- | --- | --- |
| `Birth::birth_year` | `i32::MIN..=i32::MAX` 的数字农历年，允许零、负数 | 不截断、不转无符号、不借 `Date` 隐式换算 |
| `BirthMonth` / `BirthDay` | 整数 `1..=12` / `1..=30` | 拒绝小数、NaN、Infinity、越界，不能先强转 `u8` |
| `Branch` / `Stem` | 子至亥 / 甲至癸的稳定身份 | 若使用数字，必须显式映射 `index()` 的 `0..=11` / `0..=9`；不可依赖 Rust 内存布局 |
| `Gender` | `Female` / `Male` | 明确映射，不能从布尔值、字符串大小写或空值隐式猜测 |
| `Parameters` | 性别、生年干支、出生月、紫微地支、时辰 | 由 `Parameters::new` 保证干支阴阳匹配；没有数字年份和出生日 |
| `DecadeIndex` / `YearlyIndex` | `0..=11` / `0..=9` | 先检查整数和值域，再调用 Rust 转换；不能把流年序号解释成公历年 |

非法原始宿主值无法由 Rust `u8` 错误载荷表达时，由适配层报告边界错误，不伪造经过截断的值。核心不执行任何历法、闰月、真太阳时或时区转换。

## 输出与顺序

- `Natal` 的十二宫以及 `decade` / `yearly` 的十二宫职按寅、卯、辰、巳、午、未、申、酉、戌、亥、子、丑逐项对齐。
- 宫内星曜按 `StarName::ALL` 的子序列排列：紫微、天机、太阳、武曲、天同、廉贞、天府、太阴、贪狼、巨门、天相、天梁、七杀、破军、左辅、右弼、文昌、文曲。每颗各出现一次；允许空宫、多星同宫。
- `birth_transformations` 始终为 A/B/C/D 四项；分别代表禄、权、科、忌。`self_transformations` 按宫位、宫内星序返回带有任一自化的星，同星同时有两种方向时不拆成两颗星。
- `palace_transformations(source_branch: Branch)` 按 A/B/C/D 直接返回四项，每项含源地支、目标地支、化象和目标星身份；源、目标可相同，不能过滤掉，也不能改为连续路径。定位字段、入参和查询接口已于 2026-09-07 逐项确认，见 D-229。
- `palace_transformation(source_branch: Branch, kind: Transformation)` 直接返回指定化象的一条 `PalaceTransformation`，与批量结果中的对应项一致。合法参数必有结果，不返回可选值；保留同宫关系，不生成完整四项结果、不改变本命事实，见 D-247。
- `decade_years` 按时间递增返回十项，`age` 为虚岁，`year` 为 `Option<i64>`。当前由 `i32` 出生年加 `age - 1` 得到，最大值 `2147483771`，不会丢失 `i32` 之外的合法年份；不得收窄到 `i32`。
- `decade_palace_by_name(decade, name)` / `yearly_palace_by_name(decade, yearly, name)` 按期间宫职直接返回唯一的本命 `Palace` 借用，不返回 `Option` 或复制宫位。返回对象的 `name()` 仍是本命宫职，不能据此把期间宫职或名称写回本命事实。
- `palace_transformation_sources(target_branch)` 按源宫寅至丑、各源宫 A/B/C/D 顺序迭代所有命中关系，允许空结果；同宫关系及同源的不同化象分别保留。每项仍为完整的 `PalaceTransformation`，保留来源宫、目标宫、化象和目标星曜；绑定转换结果时保留此顺序与多重关系，不将其解释为连续飞化。
- `Profile` 的 `birth_year` 与 `birth_day` 同时有值或同时无值。`Parameters` 路径无值；不得用 `0`、空字符串或虚构出生日期代替。序列化层应使用一种明确的缺失语义（如 JSON `null`），其具体格式随绑定快照确定。
- 简繁名称及简称由已有 `name_hans` / `name_hant` / `abbr_hans` / `abbr_hant` 读取。名称只展示，不作为排盘键；不要基于 `Debug` 或 `Display` 生成协议身份。
- `period_indices_at_age(age: u8)` 的输入为虚岁。局数为 `b` 时匹配 `[b, b + 119]`，返回顺序固定的 `(DecadeIndex, YearlyIndex)`；`0`、起限前、超范围均为 `None`，不新增核心错误。宿主值仍须先验证为 `u8`，不能截断大数或负数后查询；`None` 不表示缺少数字出生年份。
- `decade_by_branch` / `yearly_by_branch` 按实际地支返回一个按值生成的 `Decade` / `Yearly`，其身份与简繁名称属于指定期间；不是本命 `Palace`，不带新增地支或期间字段。绑定不能把此结果覆盖到本命宫职。
- `opposite_palace(branch)` 返回当前本命盘的对宫借用，实际地支相隔六宫；不依赖期间、星曜或数字年份。
- `sanfang_palaces(branch, include_self)` 接收实际地支和布尔值；`false` 时迭代三项，依次为相对本宫沿地支正序偏移四、八、六宫，`true` 时在首位加入本宫，迭代四项。`sizheng_palaces(branch)` 返回 `[&Palace; 4]`，顺序固定为本宫、顺移四宫、顺移八宫、对宫，与前者传入 `true` 一致。结果均无重复且借用本命事实；绑定转换时保留包含本宫的选择和返回顺序，不按全盘宫序重新排序。

## 错误合同

保持可机器匹配的错误身份与载荷；中文 `Display` 只供人读，不作为程序分支条件：

| Rust 变体 | 保留载荷 |
| --- | --- |
| `InvalidSexagenaryYear` | `stem`, `branch` |
| `InvalidLunisolarMonth` | 原始 `value` |
| `InvalidLunisolarDay` | 原始 `value` |
| `InvalidDecadeIndex` | 原始 `value` |
| `InvalidYearlyIndex` | 原始 `value` |

两种建盘方法都返回 `Result<Natal, ZiweiError>`；当前有效值类型构建后没有额外领域失败分支。内存耗尽不是这里承诺可恢复的领域错误。

按 D-239（2026-09-08，#326），V1 Rust 核心继续使用上述 `ZiweiError` 变体及载荷作为机器可匹配的错误合同，不新增字符串或数字错误码接口。跨语言稳定错误码、宿主边界错误和异常包装在 Node/Wasm 绑定实现时一起确定并验证；本表不冻结 wire format，也不允许通过解析中文 `Display`、`Debug` 或读取枚举内存布局产生错误码。

Node 阶段现已通过 D-251 选定五个对应变体的字符串码与 INVALID_ARGUMENT 宿主校验码；这只补全宿主设计，实际转换与异常测试仍属实施验收，不改变 D-239 的 Rust 核心错误合同。

## 计算追踪范围

按 D-239，计算追踪明确延期到 V1 之后；V1 不提供追踪 API、过程记录或对应绑定输出，也不将其列为当前验收缺口。未来恢复该需求时重新确定内容、开销和生命周期合同。现有只读查询仍返回命盘事实与按需结果，普通 `Debug` 输出不构成计算追踪协议。

## 生命周期

Rust 查询借用当前 `Natal`，不复制宫位、星曜或创建查询结果缓存。`Natal::star(StarName)` 和 `Natal::palace_by_star(StarName)` 分别返回唯一星曜及其所在宫位的借用；与可能查无此星的 `Palace::star` 不同，它们不返回 `Option`。绑定不能泄漏短于宿主对象生命周期的 Rust 借用：要么显式持有命盘句柄，要么转换为独立不可变快照。`Palace` 的私有内联星曜存储、`Natal` 的私有位置索引及 Rust enum 布局都不是稳定 ABI；绑定不输出位置索引。核心暂不承诺 `no_std`。

未来验收至少覆盖同一输入的核心/宿主事实等价、所有错误载荷、缺失值、简繁名称、全部序号边界、负年与零年、超过 `i32` 的年度输出、对象释放后的访问策略。此阶段没有 Node/Wasm 绑定测试，不能声称这些运行时已经支持。
