# V1 设计决策地图

本表用于追溯已确认的设计及修订关系。用户确认的规则仍为权威，不能以当前源码或历史实现替代领域确认。

## 如何阅读本表

- 查看当前功能与交付状态，先读 [README](../../README.md#范围)；当前 Rust 核心与已确认的 Node API 均已实现，早期“绑定暂缓”的条目不是当前实施状态。
- 理解当前模型与实现，读 [CONTEXT.md](../../CONTEXT.md)、[Rust 与适配层架构](rust-package-design.md#阅读路径)及 [Node 适配设计](node-api-design.md#阅读路径)。
- 追溯某项选择时，核对条目中“已替换”“修订”与后续决策的关系；不能将各行累加为现行规格。状态列中的测试数量、提交与发布描述只记录当时结果。

例如：D-238 确定现行宫内存储与星曜定位，早期 Box、槽位枚举和零依赖描述保留为历史；D-256 记录完整 Node API 实现，D-260～D-262 更新绑定目录与包名。这些决定不代表 Wasm、连续飞化、跨平台验收或发布已完成。

## 设计树

```text
重启范围
└─ V1 目标与规则权威
   ├─ 领域对象、字段结构与事实所有权
   ├─ 两类输入与归一化
   ├─ Natal 输出模型与不变量
   ├─ 大限与流年对象
   ├─ 查询 API
   ├─ Rust / Node / Wasm interface
   ├─ 包与模块结构
   └─ 测试、性能、版本与发布
```

## 已确认决策

### 领域与 Rust 核心

| ID | 决策 | 状态 |
| --- | --- | --- |
| D-000 | 保留历史业务规则为候选事实；现有代码、模块布局与公开 interface 不继承。每项候选事实须在 V1 设计中重新确认、获得来源或明确废弃。 | 已确认 |
| D-001 | V1 完成 Rust 核心的本命盘、大限、流年与查询原始事实；不提供解释或断语。Node.js/TypeScript 与 WebAssembly 的 interface 合同同时冻结，但绑定实现后续交付。连续飞化暂不属于 V1。 | 已确认 |
| D-002 | 用户确认并写入 V1 规格的规则为唯一权威；旧 Rust 与旧 Zig 仅作可验证证据。发现冲突时必须重新确认。 | 已确认 |
| D-003 | 现在定义 Node.js/TypeScript 与 WebAssembly 所需的稳定数据、错误与排序合同；不提前实现绑定。 | 已确认 |
| D-004 | `Ziwei` 是公开创建入口，仅承载本命盘创建方法；`Natal` 是不可变本命盘结果。 | 已确认 |
| D-005 | 农历换算、闰月、时区、晚子时与真太阳时均在内核外消解；内核仅接收已归一化的紫微斗数资料。 | 已确认 |
| D-006 | 仅支持唯一项目规则；不支持流派参数、运行时规则版本或调用方注入规则表。规则变更通过新规格与库版本处理。 | 已确认 |
| D-007 | 保留两种公开输入：`Birth { gender, birth_year, birth_month, birth_day, birth_hour }` 与 `Parameters { gender, birth_stem, birth_branch, birth_month, ziwei_branch, birth_hour }`。 | 已确认 |
| D-008 | 两种公开输入必须收敛到唯一归一化排盘路径；不预设或公开 `ZiweiSeed`。仅当私有实现确有独立不变量与复用价值时，才引入该类型。 | 已确认 |
| D-009 | Rust 核心公开 interface 使用 `Gender`、`Stem`、`Branch` 等领域值；Node.js/TypeScript 与 WebAssembly adapter 负责数字转换与无效值处理。核心不重复公开裸数字构造器。 | 已确认 |
| D-010 | `Natal` 是唯一、完整、不可变且自足的本命事实源；它保存后续期间、查询和跨语言输出所需的全部归一化事实，不保存原始输入、输入来源或仅为构建服务的临时值。归一化出生档案由其拥有的 `profile: Profile` 承载。 | 已确认 |
| D-011 | `Natal` 仅预计算本命事实；大限与流年按需生成，核心不缓存，且期间不新增星曜、宫干四化、生年四化或其他本命事实。 | 已确认 |
| D-012 | 已替换：`Natal` 不设置直接的 `lunar_year` 字段。数字年份由 `Profile::birth_year: Option<i32>` 承载：`Birth` 有值，`Parameters` 为 `None`；它仅为期间数字年份锚点。 | 已确认 |
| D-013 | 十二个实际宫位以寅至丑为唯一稳定顺序保存；每个宫位自带地支，并支持按地支或宫名查询。 | 已确认 |
| D-014 | 已替换：宫名、星曜、四化等事实仅保存稳定领域身份，并由 `ziwei_locale::ZiweiLabels` 派生标签。 | 已替换 |
| D-015 | 实际宫位实体的地支、宫干、星曜与自化永远属于 `Natal`；宫干四化不作为持久字段，后续由函数按需计算。大限与流年仅返回某一期间的宫职重排视图，不复制或修改 `Natal`。 | 已确认 |
| D-016 | V1 星曜集合固定为十四正曜及左辅、右弼、文昌、文曲，共十八星。 | 已确认 |
| D-017 | 生年四化由目标 `Star::birth_transformation` 保存：全盘恰四星有值。宫干四化不保存为本命对象字段，后续由函数按需计算；由其识别的向心／离心自化保存于目标 `Star::self_transformations`。仅提供原始事实与关系，不提供解释或断语。 | 已确认 |
| D-018 | 命宫以 `ming_palace_branch: Branch` 定位，不重复保存宫位名称；身宫以 `shen_palace_name: PalaceName` 与 `shen_palace_branch: Branch` 定位；来因宫以 `origin_palace_name: PalaceName` 与 `origin_palace_branch: Branch` 定位。来因宫由生年天干固定映射至地支：甲戌、乙酉、丙申、丁未、戊午、己巳、庚辰、辛卯、壬寅、癸亥；不得从五虎遁结果扫描“唯一同干宫位”。 | 已确认 |
| D-019 | 大限索引 `d` 为 `0..=11`；起始虚岁为五行局数加 `10 × d`；阳男、阴女顺行，阴男、阳女逆行；大限命宫从本命命宫按方向移动 `d` 宫。 | 已确认 |
| D-020 | 流年索引 `i` 为大限内的 `0..=9`；虚岁为五行局数加 `10 × d + i`；流年命宫为生年支加虚岁减一（模十二），并从此逆布十二流年宫职。支持单个流年视图和大限内十条流年枚举。 | 已确认 |
| D-025 | V1 查询提供类型化直接访问与固定高层便捷查询，不提供通用查询语言或可组合筛选 DSL。 | 已确认 |
| D-026 | Rust 内核的细粒度查询返回 `Natal` 内不可变事实的借用视图或迭代器；Node.js/TypeScript 与 WebAssembly adapter 负责转换为独立结果。 | 已确认 |
| D-027 | 先冻结所有领域对象、字段与事实归属，再单独设计查询函数 API；在对象模型完成前，不确认任何具体便捷查询函数。 | 已确认 |
| D-028 | 对象模型按“一个对象、一个字段”逐项讨论并确认；示意代码仅用于讨论，未确认字段不得进入规格。 | 已确认 |
| D-029 | `Natal` 经由 `profile: Profile` 保留归一化本命事实 `gender: Gender`；它既供大限顺逆行计算，也可由调用方读取。 | 已确认 |
| D-030 | `Natal` 经由 `profile: Profile` 直接保留归一化本命事实 `birth_stem: Stem`；它是生年四化、来因宫与大限方向的依据，也可由调用方读取。 | 已确认 |
| D-031 | `Natal` 经由 `profile: Profile` 直接保留归一化本命事实 `birth_branch: Branch`；它是流年按需计算的依据，也可由调用方读取。 | 已确认 |
| D-032 | `Natal` 使用 `profile: Profile` 聚合归一化出生档案；该对象的字段逐项确认，`Natal` 不直接设置出生信息字段。 | 已确认 |
| D-033 | `Profile` 使用 `birth_year: Option<i32>` 保存数字年份；它只作为期间数字年份锚点，不引入历法换算、范围或日期有效性校验。 | 已确认 |
| D-034 | `Profile` 使用 `gender: Gender` 保存完整的归一化性别事实；不以阴阳或大限行进方向替代。 | 已确认 |
| D-035 | `Profile` 直接使用 `birth_stem: Stem` 与 `birth_branch: Branch` 承载生年干支；不引入 `SexagenaryYear` 聚合对象。 | 已确认 |
| D-036 | `Profile` 使用 `birth_month: BirthMonth` 保存归一化出生月份；两种输入均有该值，不区分闰月。 | 已确认 |
| D-037 | `Profile` 使用 `birth_hour` 保存归一化出生时辰；采用出生语义前缀，而不沿用输入字段名 `hour`。具体类型另行确认。 | 已确认 |
| D-038 | `Profile::birth_hour` 使用 `Branch`；以字段文档明确其为十二时辰对应的地支，不引入 `Hour` 重复类型或裸数字。 | 已确认 |
| D-039 | `Profile` 使用 `birth_day: Option<BirthDay>` 保存归一化农历日；`Birth` 有值，`Parameters` 为 `None`。 | 已确认 |
| D-040 | `Profile` 不设置 `ziwei_branch`；紫微星所在实际宫位由 `Natal` 顶层的 `ziwei_palace_name: PalaceName` 与 `ziwei_branch: Branch` 保存。 | 已替换 |
| D-041 | `BirthMonth` 使用仅允许 `1..=12` 的 `u8` 新类型；它不记录闰月信息，也不承担历法换算。 | 已确认 |
| D-042 | `BirthDay` 使用仅允许 `1..=30` 的 `u8` 新类型；它不承担具体月份天数或历法换算校验。 | 已确认 |
| D-043 | `Profile` 不保存生肖；`Natal` 顶层以 `zodiac: Zodiac` 保存由 `birth_branch` 映射出的生肖，供调用方直接读取。 | 已确认 |
| D-044 | `Natal` 保存五行局事实，字段名为 `five_element_bureau: FiveElementBureau`；不以裸局数或按需推导替代。 | 已确认 |
| D-045 | `FiveElementBureau` 使用五个变体的枚举；每个变体同时表达固定对应的五行与局数，不使用可构造无效组合的结构体或仅局数新类型。 | 已确认 |
| D-046 | `Natal` 使用 `palaces: [Palace; 12]` 承载十二实际宫位；数量及寅至丑顺序均为类型与领域不变量。 | 已确认 |
| D-047 | 不引入 `PalaceReference`；实际宫位以本命宫职与 `Branch` 的组合定位。`Palace` 的具体字段归属由 D-194 确认。 | 已由 D-194 恢复确认 |
| D-048 | `Palace::name` 使用 `PalaceName` 枚举表达稳定宫位身份；不使用字符串或数组位置推导。 | 已确认 |
| D-049 | `Palace::branch` 使用 `Branch` 保存实际宫位所在的十二地支；不使用裸索引或数组位置推导。 | 已确认 |
| D-050 | `Palace` 使用 `stem: Stem` 保存宫干事实。 | 已确认 |
| D-051 | `Palace` 使用集合保存宫内星曜；星曜由独立 `Star` 对象承载，而不只保存 `StarName` 或改由全局落宫表保存。具体集合类型由 D-195 修订。 | 已被 D-195 修订 |
| D-052 | `Star::name` 使用 `StarName` 枚举表达固定十八星身份；简繁体显示名称由该身份映射，不存储字符串或内部数字 ID。 | 已确认 |
| D-053 | 每个 `Star` 保存 `category: StarCategory`；类别划分与 `StarCategory` 变体逐项确认。 | 已确认 |
| D-054 | `StarCategory` 使用 `Major`、`Minor`、`Auxiliary` 三个变体；不使用 `Miscellaneous`。 | 已确认 |
| D-055 | 十四正曜的 `StarCategory` 为 `Major`；左辅、右弼、文昌、文曲为 `Minor`；当前 V1 的十八星没有 `Auxiliary` 成员。 | 已确认 |
| D-056 | `Star` 使用必填字段 `galaxy: StarGalaxy`；`StarGalaxy` 的变体为 `South`、`Central`、`North`。不使用紫微／天府二分的 `StarSystem`。各星归属逐项确认。 | 已确认 |
| D-057 | `StarGalaxy` 归属固定为：`South`＝太阴、贪狼、巨门、天梁、破军；`North`＝太阳、武曲、天同、廉贞、天机；`Central`＝紫微、天府、天相、七杀、左辅、右弼、文昌、文曲。 | 已确认 |
| D-058 | `Star::birth_transformation: Option<Transformation>` 仅表达目标星承接的生年四化；四星有值、其余为 `None`。宫干四化不进入该字段。 | 已确认 |
| D-059 | `Palace` 与 `Natal` 均不保存宫干四化集合；宫干四化由后续函数基于本命事实按需计算。识别出的自化保存于目标 `Star::self_transformations`。相关函数 API 在对象模型冻结后单独设计。 | 已确认 |
| D-060 | `Star::self_transformations` 使用非可选 `SelfTransformations`；其 `inward` 与 `outward` 分别为 `Option<Transformation>`，表达一颗星曜的向心与离心自化。 | 已确认 |
| D-061 | `Natal` 使用 `ming_palace_branch: Branch` 定位命宫；不设置 `life_palace_name` 或 `life_palace_branch`，命宫键由对应实际宫位读取。 | 已确认 |
| D-062 | `Natal` 使用 `shen_palace_name: PalaceName` 与 `shen_palace_branch: Branch` 定位身宫；二者必须指向同一实际宫位，也不在读取时由出生月份和时辰重算。 | 已确认 |
| D-063 | `Natal` 使用 `origin_palace_name: PalaceName` 与 `origin_palace_branch: Branch` 定位来因宫；二者必须指向同一实际宫位。 | 已确认 |
| D-064 | `Natal` 的归一化出生档案字段为 `profile: Profile`；不使用旧上下文字段名或 `natal_context: NatalContext`。 | 已确认 |
| D-065 | `Natal` 使用顶层字段 `zodiac: Zodiac` 保存由生年地支确定的生肖；它不进入 `Profile`。 | 已确认 |
| D-066 | `Natal` 使用顶层字段 `ziwei_palace_name: PalaceName` 与 `ziwei_branch: Branch` 保存紫微星所在实际宫位；二者必须指向同一宫位，且该宫包含紫微星。 | 已确认 |
| D-067 | `Natal` 顶层字段暂时封闭为：`profile`、`zodiac`、`five_element_bureau`、`palaces`、`ming_palace_branch`、身宫定位、来因宫定位与紫微星宫位定位；新增字段须重新开启对象评审。 | 已确认 |
| D-068 | `Birth::gender` 使用 `Gender`；Node.js/TypeScript 与 WebAssembly adapter 负责 `0`、`1` 的外部转换。 | 已确认 |
| D-069 | `Birth` 使用 `birth_year: i32` 保存外部已归一化的数字年份；不使用 `year` 或额外年份值对象，也不引入年份范围或历法有效性校验。 | 已确认 |
| D-070 | `Birth` 使用 `birth_month: BirthMonth`；不使用 `month` 或裸数字。 | 已确认 |
| D-071 | `Birth` 使用 `birth_day: BirthDay`；不使用 `day` 或裸数字。 | 已确认 |
| D-072 | `Birth` 使用 `birth_hour: Branch` 表达出生时辰对应的地支；不使用 `hour` 或裸数字。 | 已确认 |
| D-073 | `Parameters::gender` 使用 `Gender`；不使用裸数字或布尔值。 | 已确认 |
| D-074 | `Parameters::birth_stem` 使用 `Stem`；不使用裸数字或字符串。 | 已确认 |
| D-075 | `Parameters::birth_branch` 使用 `Branch`；不使用裸数字或字符串。 | 已确认 |
| D-076 | `Parameters` 使用 `birth_month: BirthMonth`；不使用 `month` 或裸数字。 | 已确认 |
| D-077 | `Parameters` 使用 `ziwei_branch: Branch` 直接表达紫微星所在实际宫位地支；不使用 `ziwei_palace_branch` 或裸索引。 | 已确认 |
| D-078 | `Parameters` 使用 `birth_hour: Branch` 表达出生时辰对应的地支；不使用 `hour` 或裸数字。 | 已确认 |
| D-079 | 大限按需视图的类型名为 `Decade`；不使用 `Daxian` 或 `MajorPeriod`。 | 已撤回；重新设计 |
| D-080 | `Decade::index` 使用 `DecadeIndex`；该新类型仅允许大限零基序号 `0..=11`。 | 已撤回；重新设计 |
| D-081 | `Decade` 保存 `start_virtual_age: VirtualAge`；它是已生成大限视图的起始虚岁事实。 | 已撤回；重新设计 |
| D-082 | `Decade` 不保存结束虚岁；大限固定十年，结束虚岁由 `start_virtual_age + 9` 在后续函数中推导。 | 已撤回；重新设计 |
| D-083 | `Decade` 不保存大限命宫地支；它由 `index`、本命命宫与顺逆行规则在后续函数中计算。 | 已撤回；重新设计 |
| D-084 | `Decade` 不保存宫职重排结果；它仅保存 `index` 与 `start_virtual_age`，所有大限宫职视图由后续函数按需计算。 | 已撤回；重新设计 |
| D-085 | 已替换：`Palace` 不使用 `decade_start_age: u8`。 | 已替换 |
| D-086 | `Palace` 使用 `decade_age_range: DecadeAgeRange` 保存大限年龄区间；`DecadeAgeRange` 内部为 `[u8; 2]`，顺序为 `[start, end]`，并保证 `end == start + 9`。它由五行局的第一大限起始虚岁与实际宫位相对命宫的顺逆位置（`0..=11`）计算：`start = first_start + 10 × position`。 | 已确认 |
| D-087 | `Natal` 不保存十二大限的二维宫职布局，`Palace` 也不保存跨十二大限的一维宫职数组。指定大限序号时按需生成由十二项 `Decade` 组成的宫职重排视图；核心不缓存。`Palace::decade_age_range` 仍是实际宫位固有的大限年龄区间事实。 | 已由 D-192 恢复确认 |
| D-088 | `Decade` 不保存 `index: DecadeIndex`。大限序号只用于后续创建或查询期间视图，不属于已生成 `Decade` 的持久字段。 | 已由 D-192 恢复确认 |
| D-089 | `Decade` 不保存 `age_range: DecadeAgeRange`。大限年龄区间仅由实际 `Palace::decade_age_range` 保存，`Decade` 不重复该本命事实。 | 已由 D-192 恢复确认 |
| D-090 | `Decade` 使用 `name: DecadePalaceName` 表示一个实际宫位在指定大限中的宫职。`DecadePalaceName` 与 `PalaceName` 一一对应，但以大命、大兄、大夫、大子、大财、大疾、大迁、大友、大官、大田、大福、大父等大限宫职名称表达。指定大限的十二宫职排布为按实际宫位固定顺序组成的十二项 `Decade` 数组。 | 已被 D-182、D-184 替换 |
| D-091 | `Decade` 不保存 `ming_palace_branch`。大限命宫地支由十二项 `Decade` 中唯一的命宫位置及实际宫位固定顺序推导。 | 已由 D-192 恢复确认 |
| D-092 | 已指定的流年期间对象定名为 `Yearly`，不使用 `Annual`。`Yearly` 使用 `name: YearlyPalaceName` 表示一个实际宫位在指定流年中的宫职。`YearlyPalaceName` 与 `PalaceName` 一一对应，但以流命、流兄、流夫、流子、流财、流疾、流迁、流友、流官、流田、流福、流父等流年宫职名称表达。指定流年的十二宫职排布为按实际宫位固定顺序组成的十二项 `Yearly` 数组。 | 已被 D-182、D-184 替换 |
| D-093 | `Yearly` 不保存流年序号。流年序号只用于后续创建或查询期间视图，不属于已生成 `Yearly` 的持久字段。 | 已由 D-193 恢复确认 |
| D-094 | `Yearly` 不保存 `virtual_age`。该虚岁由生成流年视图时的大限与流年位置确定；未指定流年时展示的十个虚岁由后续独立的流年列表对象承载。 | 已由 D-193 恢复确认 |
| D-095 | `Yearly` 不保存数字年份。仅当 `Profile::birth_year` 有值时，数字年份才可由出生年份与流年虚岁推导；未指定流年时展示的年份由后续独立的流年列表对象承载。 | 已由 D-193 恢复确认 |
| D-096 | 未指定流年时按需生成固定的 `[DecadeYear; 10]`，表达十项虚岁与可用数字年份；它不进入 `PalaceName`，也不引入额外列表包装对象。 | 已确认 |
| D-097 | 已替换：不定义 `DecadeYears` 类型。十项年度摘要直接使用 `[DecadeYear; 10]`；不使用 `YearlyList`。 | 已替换 |
| D-098 | 单个年度摘要条目类型命名为 `DecadeYear`；它不同于管理流年宫职的 `Yearly` 对象。 | 已确认 |
| D-099 | `DecadeYear` 使用 `age: u8` 保存虚岁；不使用 `virtual_age` 字段名，也不引入 `VirtualAge` 新类型。 | 已确认 |
| D-100 | `DecadeYear` 使用 `year: Option<i64>` 保存可用的数字年份。`Birth` 可推导该值；缺少数字出生年份锚点的 `Parameters` 为 `None`。出生年份自身仍为 `i32`。 | 年份宽度由 D-226 修订 |
| D-101 | `DecadeYear` 不保存流年序号。其在固定 `[DecadeYear; 10]` 中的位置即为零基流年序号；该类型只保存 `age` 与 `year`。 | 已确认 |
| D-102 | `Natal::zodiac` 使用独立的 `Zodiac` 枚举保存十二生肖的稳定身份，不保存字符串或名称字段。 | 已确认 |
| D-103 | `Zodiac` 的内部稳定变体为 `Rat`、`Ox`、`Tiger`、`Rabbit`、`Dragon`、`Snake`、`Horse`、`Goat`、`Monkey`、`Rooster`、`Dog`、`Pig`；它不提供名称字段或标签 API。 | 已确认 |
| D-104 | `Gender` 的变体为 `Female` 与 `Male`；跨语言映射固定为 `0 = Female`、`1 = Male`。不使用 `Yin`／`Yang` 表示性别。 | 已确认 |
| D-105 | 通用阴阳关系使用独立的 `YinYang` 枚举，其变体为 `Yin` 与 `Yang`；它不替代 `Gender`。 | 已确认 |
| D-106 | `FiveElement` 使用 `Water`、`Wood`、`Metal`、`Earth`、`Fire` 五个变体，只表达五行身份；局数由 `FiveElementBureau` 独立表达。 | 已确认 |
| D-107 | `Stem` 使用 `Jia`、`Yi`、`Bing`、`Ding`、`Wu`、`Ji`、`Geng`、`Xin`、`Ren`、`Gui` 十个拼音稳定变体；固定简体 `Display` 只用于中文错误诊断。 | 已确认 |
| D-108 | `Stem` 的固定零基索引为 `Jia = 0` 至 `Gui = 9`，依甲、乙、丙、丁、戊、己、庚、辛、壬、癸顺序递增。 | 已确认 |
| D-109 | `Branch` 使用 `Zi`、`Chou`、`Yin`、`Mao`、`Chen`、`Si`、`Wu`、`Wei`、`Shen`、`You`、`Xu`、`Hai` 十二个拼音稳定变体；固定简体 `Display` 只用于中文错误诊断。 | 已确认 |
| D-110 | `Branch` 的固定零基索引为 `Zi = 0` 至 `Hai = 11`，依子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥顺序递增。十二实际宫位的寅至丑存储顺序独立于该索引。 | 已确认 |
| D-111 | `PalaceName` 使用 `Ming`、`XiongDi`、`FuQi`、`ZiNv`、`CaiBo`、`JiE`、`QianYi`、`JiaoYou`、`GuanLu`、`TianZhai`、`FuDe`、`FuMu` 十二个拼音稳定变体；它不提供名称字段或标签 API。 | 已由 D-191 恢复确认 |
| D-112 | `Transformation` 使用 `A`、`B`、`C`、`D` 四个稳定变体，依次映射为禄、权、科、忌；`ALL` 以此顺序公开全集，crate 内 `index()` 与其数组下标对齐；它不提供名称字段或标签 API。 | 已确认 |
| D-113 | `StarName` 使用 `ZiWei`、`TianJi`、`TaiYang`、`WuQu`、`TianTong`、`LianZhen`、`TianFu`、`TaiYin`、`TanLang`、`JuMen`、`TianXiang`、`TianLiang`、`QiSha`、`PoJun`、`ZuoFu`、`YouBi`、`WenChang`、`WenQu` 十八个拼音稳定变体；`ALL` 以此固定顺序公开全集，crate 内 `index()` 与其数组下标对齐；它不提供名称字段或标签 API。 | 已确认 |
| D-114 | `FiveElementBureau` 使用 `#[repr(u8)]`，并以 `WaterTwo = 2`、`WoodThree = 3`、`MetalFour = 4`、`EarthFive = 5`、`FireSix = 6` 表示五行局；枚举值同时是大限首限起始虚岁。 | 已确认 |
| D-115 | `BirthMonth` 与 `BirthDay` 均为 `#[repr(transparent)]` 的 `u8` 元组新类型，分别约束为 `1..=12` 与 `1..=30`。 | 已确认 |
| D-116 | `DecadeAgeRange` 为 `#[repr(transparent)]` 的 `[u8; 2]` 元组新类型，顺序为 `[start, end]`，并保证 `end == start + 9`。 | 已确认 |
| D-117 | `StarCategory` 使用 `Major`、`Minor`、`Auxiliary` 三个变体。 | 已确认 |
| D-118 | `StarGalaxy` 使用 `South`、`Central`、`North` 三个变体，分别对应南斗、中斗、北斗。 | 已确认 |
| D-119 | `Star` 固定包含 `name: StarName`、`category: StarCategory`、`galaxy: StarGalaxy`、`birth_transformation: Option<Transformation>`、`self_transformations: SelfTransformations`；其中 `birth_transformation` 仅保存生年四化。 | 已确认 |
| D-120 | `Palace` 固定包含本命宫职、地支、宫干、星曜和大限年龄区间；具体字段归属由 D-194 确认。 | 已由 D-194 恢复确认 |
| D-121 | `SelfTransformations` 固定包含 `inward: Option<Transformation>` 与 `outward: Option<Transformation>`；`None` 表示对应方向不存在自化。 | 已确认 |
| D-122 | `Profile` 固定包含 `birth_year: Option<i32>`、`gender: Gender`、`birth_stem: Stem`、`birth_branch: Branch`、`birth_month: BirthMonth`、`birth_hour: Branch`、`birth_day: Option<BirthDay>`。`Birth` 的年份与日期有值，`Parameters` 中二者为 `None`。 | 已确认 |
| D-123 | `Natal` 固定包含 `profile: Profile`、`zodiac: Zodiac`、`five_element_bureau: FiveElementBureau`、`palaces: [Palace; 12]`、`ming_palace_branch: Branch`、身宫定位、来因宫定位及紫微星宫位定位字段；所有字段均为本命事实，不保存大限或流年状态。 | 已确认 |
| D-124 | `Birth` 固定包含 `gender: Gender`、`birth_year: i32`、`birth_month: BirthMonth`、`birth_day: BirthDay`、`birth_hour: Branch`；它不包含闰月、时区或历法换算信息。 | 已确认 |
| D-125 | `Parameters` 固定包含 `gender: Gender`、`birth_stem: Stem`、`birth_branch: Branch`、`birth_month: BirthMonth`、`ziwei_branch: Branch`、`birth_hour: Branch`；字段保持私有，只能经 `new` 构造。它不包含数字年份与农历日。 | 已确认 |
| D-126 | `Ziwei` 为无字段单元结构体，只作为顶层命盘创建入口；其具体创建方法在 API 设计阶段确认。 | 已确认 |
| D-127 | `Ziwei::from_birth` 与 `Ziwei::from_parameters` 统一返回 `Result<Natal, ZiweiError>`，维持 Rust、Node.js/TypeScript 与 WebAssembly 的一致错误合同。 | 已确认 |
| D-128 | 已替换：`ZiweiError` 的初始范围仅含 `InvalidSexagenaryYear`；范围型数字错误的统一错误合同由 D-146 与 D-170 确认。 | 已替换 |
| D-129 | `Ziwei` 仅公开 `from_birth(birth: Birth) -> Result<Natal, ZiweiError>` 与 `from_parameters(parameters: Parameters) -> Result<Natal, ZiweiError>` 两个创建入口。 | 已确认 |
| D-130 | `Natal`、`Palace`、`Star` 等领域对象的字段保持私有；调用方通过只读方法或迭代器读取，不能构造或修改违反排盘不变量的对象。 | 已确认 |
| D-131 | `Natal` 提供 `profile(&self) -> &Profile`、`zodiac(&self) -> Zodiac`、`five_element_bureau(&self) -> FiveElementBureau` 三个直接本命事实读取方法。 | 已确认 |
| D-132 | `Natal` 提供 `palaces(&self) -> &[Palace; 12]`，以寅至丑稳定顺序零拷贝读取全部实际宫位。 | 已确认 |
| D-133 | `Natal` 提供 `palace(&self, branch: Branch) -> &Palace`，按地支常数时间返回唯一实际宫位；不使用 `Option`，因为十二地支必各有一宫。 | 已确认 |
| D-134 | `Natal` 提供 `palace_by_name(&self, name: PalaceName) -> &Palace`，按本命宫位名称返回唯一实际宫位；不使用 `Option`，因为十二宫位名称恰各出现一次。 | 已确认 |
| D-135 | `Natal` 提供 `ming_palace(&self) -> &Palace`，直接返回命宫对应的实际宫位。 | 已确认 |
| D-136 | `Natal` 提供 `shen_palace(&self) -> &Palace`，直接返回身宫对应的实际宫位。 | 已确认 |
| D-137 | `Natal` 提供 `origin_palace(&self) -> &Palace`，直接返回来因宫对应的实际宫位。 | 已确认 |
| D-138 | `Natal` 提供 `ziwei_palace(&self) -> &Palace`，直接返回包含紫微星的唯一实际宫位。 | 已确认 |
| D-139 | `Palace` 提供 `name_hans() -> &'static str`、`name_hant() -> &'static str`，以及 `name() -> PalaceName`、`branch() -> Branch`、`stem() -> Stem`、`stars() -> &[Star]`、`decade_age_range() -> DecadeAgeRange` 七个基础只读方法。 | 已由 D-196 恢复确认 |
| D-140 | `Palace` 提供 `star(&self, name: StarName) -> Option<&Star>`，按星曜名称查询宫内星曜。 | 已确认 |
| D-141 | `Star` 提供 `name_hans() -> &'static str`、`name_hant() -> &'static str`，以及 `name() -> StarName`、`category() -> StarCategory`、`galaxy() -> StarGalaxy`、`birth_transformation() -> Option<Transformation>`、`self_transformations() -> SelfTransformations` 七个基础只读方法。 | 已确认 |
| D-142 | `SelfTransformations` 提供 `inward() -> Option<Transformation>` 与 `outward() -> Option<Transformation>` 两个只读方法。 | 已确认 |
| D-143 | `Profile` 提供 `birth_year()`、`gender()`、`birth_stem()`、`birth_branch()`、`birth_month()`、`birth_hour()`、`birth_day()` 七个与字段同名的基础只读方法。 | 已确认 |
| D-144 | `DecadeIndex` 与 `YearlyIndex` 为仅用于 API 入参的 `#[repr(transparent)]` `u8` 新类型，分别约束为 `0..=11` 与 `0..=9`；它们不进入 `PalaceName`。 | 已确认 |
| D-145 | `DecadeIndex` 与 `YearlyIndex` 均通过标准 `TryFrom<u8>` 构造；越界构造返回明确错误而非 `Option`。 | 已确认 |
| D-146 | `ZiweiError` 包含 `InvalidSexagenaryYear { stem, branch }`、`InvalidDecadeIndex { value }`、`InvalidYearlyIndex { value }` 三个公开变体；前者服务于 `Parameters::new`，后两者服务于期间序号转换。月、日范围错误由 D-170 追加。 | 已确认 |
| D-147 | `Natal` 按需生成 `[Decade; 12]` 大限宫职结果且不缓存；具体方法名与签名由 D-225 确认为 `decade(&self, index: DecadeIndex) -> [Decade; 12]`。 | 已由 D-225 补充并实现 |
| D-148 | `Natal` 按需生成 `[Yearly; 12]` 流年宫职结果且不缓存；具体方法名与签名由 D-227 确认为 `yearly(&self, decade: DecadeIndex, index: YearlyIndex) -> [Yearly; 12]`。 | 已由 D-227 补充并实现 |
| D-149 | `Natal` 提供 `decade_years(&self, decade: DecadeIndex) -> [DecadeYear; 10]`，按需返回大限内十项虚岁与可用数字年份摘要，不包含流年宫职。 | 已由 D-226 实现 |
| D-150 | `DecadeYear` 提供 `age() -> u8` 与 `year() -> Option<i64>`；大限、流年的宫位结果读取 interface 由 D-191 重新打开。 | 年份读取类型由 D-226 修订 |
| D-151 | 宫干四化的单条按需关系结果对象命名为 `PalaceTransformation`；它不同于仅表示禄、权、科、忌类别的 `Transformation` 枚举。 | 已确认 |
| D-152 | `PalaceTransformation` 使用 `transformation: Transformation` 标识该关系的四化类别。 | 已确认 |
| D-153 | `PalaceTransformation` 使用 `star: StarName` 保存宫干四化命中的目标星曜身份。 | 已确认 |
| D-155 | 宫位与星曜稳定身份的类型后缀尚未统一。 | 已被 D-187 替换 |
| D-156 | `PalaceName` 不提供标签方法。 | 已由 D-191 恢复确认 |
| D-157 | 已替换：`StarName` 不再提供标签方法。 | 已替换 |
| D-158 | 已替换：`Stem` 与 `Branch` 不再提供标签方法。 | 已替换 |
| D-159 | 已替换：`Zodiac` 不再提供派生标签方法。 | 已替换 |
| D-160 | 已替换：`Gender` 不再提供标签方法。 | 已替换 |
| D-161 | 已替换：`YinYang` 不再提供派生标签方法。 | 已替换 |
| D-162 | 已替换：`FiveElement` 不再提供标签方法。 | 已替换 |
| D-163 | 已替换：`Transformation` 不再提供标签方法。 | 已替换 |
| D-164 | 已替换：`FiveElementBureau` 不再提供标签方法。 | 已替换 |
| D-165 | 已替换：`StarCategory` 不再提供标签方法。 | 已替换 |
| D-166 | 已替换：`StarGalaxy` 不再提供标签方法。 | 已替换 |
| D-167 | `BirthMonth` 与 `BirthDay` 均提供 `get() -> u8`，返回内部已验证数值；它们不提供中文格式化或展示名称。 | 已确认 |
| D-168 | `DecadeAgeRange` 提供 `start() -> u8` 与 `end() -> u8`，不直接暴露内部 `[u8; 2]` 表示或新增区间对象。 | 已确认 |
| D-169 | `DecadeIndex` 与 `YearlyIndex` 均提供 `get() -> u8`，返回已验证的零基期间序号。 | 已确认 |
| D-170 | `BirthMonth` 与 `BirthDay` 均通过标准 `TryFrom<u8>` 构造，分别约束 `1..=12` 与 `1..=30`；越界返回 `ZiweiError::InvalidLunisolarMonth { value }` 或 `ZiweiError::InvalidLunisolarDay { value }`。 | 已确认 |
| D-171 | `Stem` 与 `Branch` 均提供 `index() -> u8`，返回各自固定的零基领域序号；二者还实现固定简体 `Display`，只用于组合核心中文错误诊断，不提供语言选择或 `name()` 标签方法。 | 已确认 |
| D-172 | `FiveElementBureau` 作为不可拆解的领域枚举公开；不提供 `element()` 或 `number()` 等组成部分读取方法，也不承担显示职责。 | 已确认 |
| D-173 | 稳定身份类型使用 `PalaceName`、`StarName`、`DecadePalaceName`、`YearlyPalaceName` 后缀。`Decade` 与 `Yearly` 均以 `name` 字段和 `name()` 方法公开其期间宫职名称。期间宫职名称不与期间序号混用。 | 已被 D-182、D-184 替换 |
| D-174 | 已替换：`ziwei` 不公开 `Lang` 或任何标签读取方法，`ziwei_locale` 单向依赖核心提供标签。 | 已替换 |
| D-175 | `DecadePalaceName` 与 `YearlyPalaceName` 各自公开 `palace_name() -> PalaceName`，表达与本命宫位名称的一一对应；它们本身不提供名称字段或标签 API。 | 已被 D-182、D-184 替换 |
| D-176 | `ZiweiError::Display` 使用固定中文诊断；无效六十甲子通过 `Stem` 与 `Branch` 的固定简体 `Display` 组合，其余边界错误包含原始数值。它不是可配置的本地化接口，调用方必须通过错误变体和字段而非文案匹配错误。 | 已确认 |
| D-177 | `ziwei_locale` 不保留为 workspace 包，核心不定义 `Lang`、运行时标签读取器或全局语言状态。`Palace`、`Star`、`Decade`、`Yearly` 自行管理对应简、繁名称；名称不参与排盘规则。具体字段与读取方法由各对象后续确认。 | 本地化边界保持确认；对象 interface 待确认 |
| D-178 | 已替换：D-130 的私有字段约束不适用于 `Palace`、`Star`、`Decade`、`Yearly` 的名称字段。 | 已替换 |
| D-179 | `Gender`、`Stem`、`Branch` 分别提供 `yin_yang() -> YinYang`，返回各自固定的阴阳归属；`Branch` 另提供 `zodiac() -> Zodiac`，返回一一对应的生肖。这些方法只表达基础领域事实，不提供名称或本地化；`Stem` 的五虎遁表归属由 D-206 补充。 | 已确认；天干数据归属由 D-206 补充 |
| D-180 | 出生资料私有模块的辅助函数以甲子为数字年份同余 `4` 的基准，从任意 `i32` 数字农历年份导出 `(Stem, Branch)`；实现使用 `rem_euclid`，不以 `birth_year - 4` 直接相减。`Parameters::new` 仅在生年干支阴阳相同时构造成功；十干与十二支的 120 种组合中恰有 60 种有效。 | 已确认；文件归属由 D-200 修订 |
| D-181 | 五虎遁按甲己丙寅、乙庚戊寅、丙辛庚寅、丁壬壬寅、戊癸甲寅五组起干，并分别顺布十二宫干；规则空间固定为 `5 × 12`，不将十个生年干误建模为十种独立宫干排布。 | 已确认 |
| D-182 | 宫职统一使用 `PalaceScope` 表达；枚举变体为 `Natal(PalaceName)`、`Decade(PalaceName)`、`Yearly(PalaceName)`。`PalaceScope` 提供 `palace_name()`、`name_hans()` 与 `name_hant()`，由作用域与宫位名称共同确定完整宫职身份及简、繁名称。 | 已被 D-188 替换 |
| D-183 | `Palace` 私有持有 `scope: PalaceScope::Natal(PalaceName)`，提供 `scope() -> PalaceScope`；`name()` 从该作用域投影宫位名称。`Palace` 不再保存 `name_hans`、`name_hant`，也不再提供同名方法。 | 已被 D-188 替换 |
| D-184 | 删除 `DecadePalaceName`、`YearlyPalaceName`、`Decade` 与 `Yearly`；四个限运领域值的文件归属已被 D-185 替换。 | 已被 D-191 替换 |
| D-185 | `domain/period.rs` 承载完整限运领域；当前保存 `DecadeIndex`、`YearlyIndex`、`DecadeAgeRange` 与 `DecadeYear`，未来的流月、流日、流时领域值也归入该模块。不因共同模块而引入无行为的公开 `Period` 枚举、结构体或 trait，crate 根公开类型保持不变。 | 已被 D-199 替换 |
| D-186 | 唯一领域引擎的 Cargo 包名、Rust import 名与目录名统一为 `ziwei`；不保留 `ziwei_core` 兼容包或创建纯重导出门面。未来 adapter 直接单向依赖 `ziwei`。 | 已确认 |
| D-187 | 宫位与星曜的稳定领域名称分别使用 `PalaceName` 与 `StarName`；相关字段、参数和读取方法统一采用 `name` 术语。二者分别通过 `PalaceName::ALL` 与 `StarName::ALL` 公开稳定全集，不保留旧类型兼容别名。 | 宫职部分由 D-191 修订；星曜部分保持确认 |
| D-188 | 十二种共享宫职使用 `PalaceRole`，变体为 `Ming`、`XiongDi`、`FuQi`、`ZiNv`、`CaiBo`、`JiE`、`QianYi`、`JiaoYou`、`GuanLu`、`TianZhai`、`FuDe`、`FuMu`，并以 `ALL` 按此顺序公开全集。完整宫职名称使用 `PalaceName`，变体为 `Natal(PalaceRole)`、`Decade(PalaceRole)`、`Yearly(PalaceRole)`；提供 `role()`、`name_hans()` 与 `name_hant()`。删除 `PalaceScope` 且不保留兼容别名；具体大限与流年序号不进入 `PalaceName`。 | 已被 D-191 替换 |
| D-189 | `Palace` 私有保存 `role: PalaceRole`，不保存完整 `PalaceName`。`Palace::name()` 由该宫职派生 `PalaceName::Natal(role)`，从类型内部排除实际本命宫位持有大限或流年名称的无效状态。 | 已被 D-191 替换 |
| D-190 | `PalaceName` 只表达稳定宫职名称身份，不公开 `name_hans()` 或 `name_hant()`。`Palace` 平级提供 `role()`、`name()`、`name_hans()` 与 `name_hant()`；简繁名称由私有常量映射派生，不作为字段重复保存。大限与流年的结果对象也必须平级提供简繁名称，因此原先直接返回 `[PalaceName; 12]` 的 interface 重新打开，留待查询阶段确认。 | 已被 D-191 替换 |
| D-191 | `PalaceName` 恢复为本命、大限与流年共用的唯一十二宫职领域类型，使用 D-111 的十二个稳定变体及 `ALL` 顺序。删除 `PalaceRole` 与 `PalaceScope`，不保留兼容别名。`Palace`、`Decade`、`Yearly` 各自持有并管理自己的 `PalaceName`；`Decade` 与 `Yearly` 恢复为限运领域对象，其完整字段、名称读取方法和公开返回 interface 下一步逐项确认。 | 已确认 |
| D-192 | 一个 `Decade` 表示某个实际宫位在指定大限中的宫职结果，结构只保存 `name: PalaceName`，不保存大限序号、年龄区间或宫位地支。指定大限按实际宫位的寅至丑固定顺序按需生成 `[Decade; 12]`，核心不预存、不缓存；对象只读方法由 D-197 确认，`Natal` 的公开生成方法由 D-225 确认。 | 已由 D-197、D-225 补充 |
| D-193 | 一个 `Yearly` 表示某个实际宫位在指定流年中的宫职结果，结构只保存 `name: PalaceName`，不保存大限序号、流年序号、虚岁、数字年份或宫位地支。指定流年按实际宫位的寅至丑固定顺序按需生成 `[Yearly; 12]`，核心不预存、不缓存；对象只读方法由 D-198 确认，`Natal` 的公开生成方法由 D-227 确认。 | 已由 D-198、D-227 补充 |
| D-194 | `Palace` 始终表示本命实际宫位，固定保存私有字段 `name: PalaceName`、`branch: Branch`、`stem: Stem`、宫内星曜集合与 `decade_age_range: DecadeAgeRange`。它不保存 `PalaceRole`、`PalaceScope` 或期间宫职；星曜集合的具体类型由 D-195 修订，只读方法由 D-196 确认。 | 已被 D-195、D-196 补充 |
| D-195 | `Palace::stars` 使用 `Box<[Star]>` 保存构建完成后不再增删的宫内星曜；排盘构建阶段可先使用 `Vec<Star>` 聚合，再通过 `into_boxed_slice()` 冻结。`Palace::stars()` 仍以 `&[Star]` 暴露只读切片，不向调用方泄漏所有权容器。 | 已由 D-235 修订，并被 D-238 的 `ArrayVec<Star, 6>` 替换 |
| D-196 | `Palace` 直接提供 `name()`、`name_hans()`、`name_hant()`、`branch()`、`stem()`、`stars()`、`star()` 与 `decade_age_range()` 只读方法；本命宫职简繁名称由其 `name: PalaceName` 经私有映射派生。删除 `scope()`，不向调用方暴露 `PalaceScope` 或其他作用域包装。 | 已确认 |
| D-197 | `Decade` 是可复制、可比较的只读领域对象，直接提供 `name() -> PalaceName`、`name_hans() -> &'static str` 与 `name_hant() -> &'static str`；大限宫职简繁名称由其唯一字段 `name` 经限运私有模块映射派生。构造器保持 crate 私有，不提前公开独立构造入口。 | 已确认；文件归属由 D-199 修订 |
| D-198 | `Yearly` 是可复制、可比较的只读领域对象，直接提供 `name() -> PalaceName`、`name_hans() -> &'static str` 与 `name_hant() -> &'static str`；流年宫职简繁名称由其唯一字段 `name` 经限运私有模块映射派生。构造器保持 crate 私有，不提前公开独立构造入口。 | 已确认；文件归属由 D-199 修订 |
| D-199 | 完整限运领域的私有模块与文件统一命名为 `luck`、`domain/luck.rs`，不再使用 `period`、`domain/period.rs`。`Decade`、`Yearly`、期间索引、年龄区间和年度摘要继续由 crate 根扁平导出；不新增公开 `Luck` 类型，也不改变任何领域语义或公开导入路径。 | 已确认 |
| D-200 | 完整出生资料领域的私有模块与文件统一命名为 `profile`、`domain/profile.rs`，不再使用 `birth`、`domain/birth.rs`。归一化出生档案类型统一命名为公开 `Profile`，与 `BirthMonth`、`BirthDay`、`Birth`、`Parameters` 一同由 crate 根扁平导出；不保留旧类型名称的兼容别名。 | 已确认 |
| D-201 | `FiveElementBureau` 的定义与单元测试归入 `domain/primitive.rs`，删除私有 `five_element_bureau` 模块与 `domain/five_element_bureau.rs`。`FiveElementBureau` 与 `FiveElement` 仍是相互独立的领域类型，前者继续由 crate 根扁平导出；不改变领域语义或公开导入路径。 | 已确认 |
| D-202 | 五虎遁完整规则族归入私有 `rules/five_tiger_dun.rs`：`FIVE_TIGER_DUN_PALACE_STEMS`、宫干计算函数与表驱动测试必须共置；`rules.rs` 声明子模块，并通过 `pub(crate) use` 保留对应私有 interface。保留可审计的 `5 × 12` 常量表和已确认函数名，不改变 crate 的公开 interface。 | 已被 D-204 替换 |
| D-203 | `FiveElementBureau` 提供 crate 私有的 `const fn from_ming_palace(stem: Stem, branch: Branch) -> Self`，按天干甲乙、丙丁、戊己、庚辛、壬癸五组及地支子丑、寅卯、辰巳、午未、申酉、戌亥六组查询固定五行局表。五行局表五行依次为“金水火金水火、水火土水火土、火土木火土木、土木金土木金、木金水木金水”。不实现语义含混的 `From<(Stem, Branch)>`，也不新增公开的五行或局数读取方法。 | 已确认 |
| D-204 | 删除 `rules/five_tiger_dun.rs` 与 `FIVE_TIGER_DUN_PALACE_STEMS`。宫干计算函数直接保留在 `rules.rs`：先按甲己丙寅、乙庚戊寅、丙辛庚寅、丁壬壬寅、戊癸甲寅确定寅宫起干，再依 `Stem::ALL` 顺序生成寅至丑十二宫干；表驱动测试继续显式覆盖五组完整输出。 | 已被 D-205 替换 |
| D-205 | 五虎遁由 `Stem` 自身提供 crate 私有方法：先按甲己丙寅、乙庚戊寅、丙辛庚寅、丁壬壬寅、戊癸甲寅确定寅宫起干，再依 `Stem::ALL` 顺序生成寅至丑十二宫干。`rules.rs` 不保留同义自由函数，不恢复 `FIVE_TIGER_DUN_PALACE_STEMS` 或五虎遁子模块；五组完整输出由 `Stem` 的领域测试覆盖。 | 已被 D-206 替换 |
| D-206 | `Stem` 不实现宫干计算方法；它以 crate 私有关联常量 `FIVE_TIGER_DUN_PALACE_STEMS: [[Stem; 12]; 5]` 保存甲己、乙庚、丙辛、丁壬、戊癸五组寅至丑十二宫干。`rules.rs` 提供 crate 私有常量函数，负责将十个生年天干映射至关联表中的五组结果。不创建五虎遁子模块，也不改变 crate 公开 interface。 | 数据与行为归属保持确认；函数名由 D-209 修订 |
| D-207 | 命宫与身宫地支由 `rules.rs` 中单一的 crate 私有常量函数同时计算；返回顺序固定为命宫、身宫。它复用同一个月份基准与时辰索引，不改变命宫逆数时辰、身宫顺数时辰的既有规则。 | 计算合并保持确认；函数名由 D-208 修订 |
| D-208 | 该函数命名为 `const fn compute_ming_shen_branches(birth_month, birth_hour) -> (Branch, Branch)`；内部纯计算函数统一使用 `compute_*` 前缀。 | 已确认 |
| D-209 | 五虎遁宫干计算函数命名为 `const fn compute_palace_stems(birth_stem: Stem) -> [Stem; 12]`，与内部纯计算函数的 `compute_*` 命名约定一致。 | 已确认 |
| D-210 | 本命十二宫职排布函数命名为 `fn compute_natal_palace_names(ming_palace_branch: Branch) -> [PalaceName; 12]`；使用 `compute_*` 前缀，输出按寅至丑排列的十二宫职。 | 已确认 |
| D-211 | `rules.rs` 的函数接口优先传递领域值，索引只用于函数内部计算与数组访问。命宫与身宫定位返回 `(Branch, Branch)`，来因宫由 `const fn compute_origin_palace_branch(birth_stem: Stem) -> Branch` 返回地支。本命宫职排布与 `compute_decade_age_ranges` 均接收 `ming_palace_branch: Branch`；后者返回按寅至丑排列的 `[DecadeAgeRange; 12]`。不保留旧索引接口的兼容别名。 | 已确认 |
| D-212 | 紫微定位由 `const fn compute_ziwei_branch(bureau: FiveElementBureau, birth_day: BirthDay) -> Branch` 直接计算。设局数为 `b`、日数为 `d`，取上界商 `q = ceil(d / b)`，补数 `p = q × b - d`；从寅宫顺移 `q - 1` 宫，再按 `p` 奇数逆退、偶数顺进，补数为零时不移动。公式沿用旧 Rust `7164d856` 与旧 Zig `264567b8`，当前不生成五局三十日定位查表。 | 已确认 |
| D-213 | 十四主星沿用旧 Rust `7164d856` 与旧 Zig `264567b8` 的排布规则，由 `fn compute_major_star_branches(ziwei_branch: Branch) -> [Branch; 14]` 直接计算，顺序对应 `StarName::ALL` 的前十四项。紫微组六星按 `0、1、3、4、5、8` 逆布，天府组八星按 `0、1、2、3、4、5、6、10` 顺布；天府与紫微关于寅申轴对称。此分组不改变星系归属；当前不生成生产查表、不填充辅星占位值、不组装 `Star`。 | 排布规则不变；执行方式由 D-233 修订 |
| D-214 | 四颗辅星由 `fn compute_minor_star_branches(birth_month: BirthMonth, birth_hour: Branch) -> [Branch; 4]` 直接计算，固定返回左辅、右弼、文昌、文曲地支，对应 `StarName::ALL` 的最后四项。左辅从辰起正月顺行，右弼从戌起正月逆行；文昌从戌起子时逆行，文曲从辰起子时顺行。规则沿用旧 Rust `7164d856` 与旧 Zig `264567b8`；不新增文件、不生成生产查表、不组装 `Star`，测试覆盖全部 `12 × 12` 月时组合。 | 排布规则不变；执行方式由 D-233 修订 |
| D-215 | 十八星统一由 `fn compute_star_branches(ziwei_branch: Branch, birth_month: BirthMonth, birth_hour: Branch) -> [Branch; 18]` 定位，返回数组严格对应 `StarName::ALL`，供两种输入路径复用。D-213、D-214 的排布规则保持不变，两函数降为 `rules` 模块内部私有辅助函数。测试保留原有固定落宫基准，通过统一入口验证全部 `12 × 12 × 12` 组合；不新增规则、类型或文件，不组装 `Star`。 | 已确认；已实现 |
| D-216 | 十干四化目标星曜由 `const fn compute_transformation_stars(stem: Stem) -> [StarName; 4]` 返回，顺序为禄、权、科、忌，与 `Transformation::ALL` 一致。通用天干映射供生年四化、宫干四化与自化共用；固定映射作为函数外私有常量保存在 `rules.rs`，不新增文件。采用已确认的项目规则，与旧 Rust `7164d856`、旧 Zig `264567b8` 一致；壬干固定返回天梁、紫微、左辅、武曲。当前仅返回星曜身份，不修改 `Star` 或生成四化关系；测试覆盖全部 `10 × 4` 映射。 | 已确认；已实现 |
| D-217 | 生年四化由 `fn compute_birth_transformations(birth_stem: Stem) -> [Option<Transformation>; 18]` 分配，顺序对应 `StarName::ALL`。复用 `compute_transformation_stars`，四颗目标星为 `Some(...)`，其余十四星为 `None`，不重复维护生产映射表。数组仅用于后续构建 `Star::birth_transformation`，不新增命盘字段、不处理自化。测试验证全部 `10 × 18` 结果，且禄、权、科、忌各出现一次。 | 已确认；已实现 |
| D-218 | 自化由 `fn compute_self_transformations(palace_stems: &[Stem; 12], star_branches: &[Branch; 18]) -> [SelfTransformations; 18]` 分配。宫干按寅至丑排列，星曜落宫与输出按 `StarName::ALL` 排列；本宫宫干命中为离心，对宫宫干命中为向心，两方向独立保存且不受生年四化影响。复用十干四化映射，不新增查表、字段、关系对象或文件。固定样例与独立基准覆盖 `5 × 12 × 12 × 12 = 8,640` 种输入的全部十八星及两种自化。 | 已确认；已实现 |
| D-220 | 十八星对象由 `fn compute_stars(birth_stem: Stem, palace_stems: &[Stem; 12], star_branches: &[Branch; 18]) -> [Star; 18]` 在 `rules.rs` 内组装。宫干按寅至丑排列，星曜落宫与输出按 `StarName::ALL` 排列。复用生年四化、自化计算，在组装处提供 D-055、D-057 确认的类别与星系，再调用现有五参数 `Star::new`；不收紧构造器、不重新计算落宫、不组装十二宫、不新增文件。测试通过组装入口验证十八星顺序、固定归属、十干生年四化及向心／离心自化事实。 | 原接口已实现；内部迭代器衔接由 D-232 修订 |
| D-221 | 十二宫由 `fn compute_palaces(palace_names: &[PalaceName; 12], palace_stems: &[Stem; 12], decade_age_ranges: &[DecadeAgeRange; 12], star_branches: &[Branch; 18], stars: [Star; 18]) -> [Palace; 12]` 在 `rules.rs` 内组装。三组宫位数据与输出按寅至丑排列，星曜与落宫地支按 `StarName::ALL` 排列，参数来自同一命盘。按值取得星曜并逐宫聚合为 `Vec<Star>`，再转为 `Box<[Star]>`，不克隆、不重算；保留宫内顺序和全部星曜事实。不新增文件，不改领域字段或构造接口，不组装 `Natal`。固定样例与 `3,456` 种组合验证字段对应、空宫、多星同宫、星曜无遗漏或重复及四化保留。 | 原接口已实现；内部迭代器衔接由 D-232 修订 |
| D-222 | 本命盘由 `rules.rs` 中的 crate 私有 `fn compute_natal(profile: Profile, ziwei_branch: Branch) -> Natal` 统一构建。档案已归一化，紫微地支已确定，两者属于同一命盘；函数不承担输入归一化、校验或紫微定位。复用现有规则完成生肖、命身宫、宫干、宫职、五行局、大限年龄、十八星与四化计算及十二宫组装；身宫、来因宫和紫微宫的宫职从同一套实际宫位读取，再调用既有 `Natal::new`，星曜与宫位按所有权移入、不克隆。保留档案可选年份和出生日；不增加公开入口、中间类型或文件，不改变领域字段、构造器参数，不预计算期间宫职布局。固定命盘与 `207,360` 种组合验证字段一致性、顺逆年龄、星曜与生年四化唯一性及宫位定位。 | 统一路径已实现；定位接口由 D-224 修订 |
| D-223 | 接通第一个公开排盘入口 `Ziwei::from_parameters(parameters: Parameters) -> Result<Natal, ZiweiError>`。新增私有 `ziwei.rs` 定义无字段单元结构体 `Ziwei`，由 crate 根扁平导出；公开方法仅转发至 `rules.rs` 的 `compute_natal_from_parameters`。内部衔接构造数字年份、出生日均为 `None` 的 `Profile`，将其与给定紫微地支传入 `compute_natal`，不新增中间模型、不重复校验、不补造日期或重新定位紫微。保留既定 `Result` 合同，当前无额外错误分支；`from_birth` 留待后续，不添加占位方法。现有公开接口测试覆盖固定完整命盘、`5,760` 种输入组合的字段保留及构造输入时的错误，另以文档测试验证调用示例。 | 公开入口已实现；内部调用方式由 D-224 修订 |
| D-224 | 接通 `Ziwei::from_birth(birth: Birth) -> Result<Natal, ZiweiError>`，公开方法只转发至 `rules::compute_natal_from_birth`。该函数复用出生资料模块的数字年份转干支辅助函数，保留 `Some(birth_year)`、`Some(birth_day)`。将 `compute_natal` 的第二参数改为 `resolve_ziwei: impl FnOnce(FiveElementBureau) -> Branch`：统一计算命身宫、宫干、五行局后调用一次；`Birth` 用五行局和出生日定位紫微，`Parameters` 返回已有紫微地支。闭包仅用于内部两条固定路径，静态分发、不装箱、不存储，不新增中间模型或文件，也不重复计算上述本命事实。保留公开错误合同和领域对象结构，不增加历法换算或年份范围校验。公开测试覆盖固定样例、零年／负年／`i32` 边界、输入范围错误及 `86,400` 组两种入口排盘事实对照。 | 已确认；已实现 |
| D-225 | 接通 `Natal::decade(&self, index: DecadeIndex) -> [Decade; 12]`，公开方法只转发至 `rules::compute_decade`。大限零基序号 `0..=11` 已由 `DecadeIndex` 保证，直接返回数组，不重复校验或增加 `Result`。大命从本命命宫按大限顺逆移动指定宫数，再从大命逆布十二宫职；顺逆只决定大命位置。输出按寅至丑与 `Natal::palaces()` 逐项对应，每项保持既有 `Decade` 结构及名称方法。计算只借用本命事实，不新增字段、不预计算、不缓存、不分配堆内存，不重排星曜或修改宫干及年龄区间；不提前实现流年或年度摘要。公开测试覆盖四种顺逆组合的固定布局、两种入口下全部十二命宫位置和十二大限序号共 `1,152` 组布局、与年龄区间的一致性、查询不变性及无效序号，另以文档测试验证调用示例。 | 已确认；已实现 |
| D-226 | 接通 `Natal::decade_years(&self, decade: DecadeIndex) -> [DecadeYear; 10]`，公开方法只转发至 `rules::compute_decade_years`。按大限内 `0..=9` 的时间顺序返回十项摘要；虚岁为五行局数加 `10 × 大限序号` 再加流年序号，与宫位顺逆无关。将 `DecadeYear::year` 字段、crate 私有构造器参数及公开读取方法从 `Option<i32>` 改为 `Option<i64>`；`Birth` 和 `Profile` 的出生年份保持 `i32`。数字年份先扩宽再加虚岁减一，不跳过零年，`None` 仅表示缺少出生年份，不以溢出降级为无值。年龄范围 `2..=125`，所有合法输入均可直接生成结果，无额外错误、堆分配或缓存，不生成流年宫职、不修改本命事实。公开测试覆盖固定十项摘要、五种五行局 × 两种性别 × 两种入口 × 十二大限共 `240` 组摘要（`2,400` 项）、既有年龄区间一致性、零年及 `i32` 两端边界、重复查询与无效序号，另以 doctest 验证调用示例。 | 已确认；已实现 |
| D-227 | 接通 `Natal::yearly(&self, decade: DecadeIndex, index: YearlyIndex) -> [Yearly; 12]`，公开方法只转发至 `rules::compute_yearly`。大限序号为 `0..=11`，流年序号为该大限内的 `0..=9`，不是数字年份；范围由既有值类型保证，直接返回数组，不新增错误分支。以五行局和两个序号计算虚岁，由生年支加虚岁减一定位流命，再从流命逆布十二宫职，结果按寅至丑与 `palaces()` 逐项对应。不受大限顺逆影响，不依赖数字出生年份；两种创建入口均支持，不先生成大限宫职或年度摘要。保持 `Yearly` 和本命对象字段不变，无堆分配、无缓存，不修改本命事实。公开测试以固定布局和独立逐年旋转基准覆盖十二生年支、十二月份、两种性别、两种入口及全部十二大限和十个流年序号共 `69,120` 组布局，并验证五种五行局均被覆盖；另覆盖最大虚岁、数字年份边界、名称、重复查询和无效期间序号，以 doctest 验证调用示例。 | 已确认；已实现 |
| D-154 | `PalaceTransformation` 的源宫、目标宫定位字段及相关查询曾暂缓设计。 | 已于 2026-09-07 经逐项确认，由 D-229 关闭；保留此前暂缓历史 |
| D-228 | 提供 `Natal::star(StarName) -> &Star`、`palace_by_star(StarName) -> &Palace`、`birth_transformations() -> [(&Palace, &Star); 4]` 和 `self_transformations() -> impl Iterator<Item = (&Palace, &Star)> + '_`。借用既有本命对象，不增字段、缓存或堆分配。每颗支持的星曜都有唯一落宫，前两项不返回 `Option`；生年四化按 A/B/C/D；自化按寅至丑及宫内星序，同星双向只返回一项。 | 已确认（2026-09-07，第 6～9 项）；已实现；不增私有字段的约束由 D-238 修订，公开语义不变 |
| D-229 | `PalaceTransformation` 放在既有 `domain/transformation.rs`，含私有 `source_branch: Branch`、`target_branch: Branch`、`transformation: Transformation`、`star: StarName` 及同名读取方法。`Natal::palace_transformations(source_branch: Branch) -> [PalaceTransformation; 4]` 使用实际地支作为查询参数，不接收裸索引或宫职名称；转发规则层，复用十干四化表，按 A/B/C/D 直接返回四项，不使用 `Vec`、`Option` 或 `Result`。源、目标允许相同，同宫关系保留；不缓存、不重排星曜、不连续飞化。 | 已确认（2026-09-07，第 1～5 项）；已实现 |
| D-230 | V1 收尾增加静态手算样例、独立公开查询测试、120 输入的两入口建盘基准、20 轮本机校准记录器、契约／机器不匹配拒绝、只做 smoke 的 CI、适配语义合同和本地打包检查。性能报告不含查询；脏工作树不能登记正式基线。不实现 Node/Wasm 绑定，不提交、推送或发布。 | 本轮工程实现；实际验证结果见收尾报告 |
| D-231 | 第 7 项确认时，将原查询名 `star_palace` 改为 `palace_by_star`，与 `palace`、`palace_by_name` 保持同一宫位查询命名方式。参数仍为 `StarName`，返回仍为 `&Palace`；只同步方法名、调用、测试和示例，不改变查询算法或其他已确认接口。 | 已确认；2026-09-07 授权执行并实现 |
| D-232 | 在已授权的 `rules.rs` 性能优化中重设计内部星曜衔接：`compute_stars` 返回严格按 `StarName::ALL` 生成十八颗星曜的 `impl ExactSizeIterator<Item = Star>`，`compute_palaces` 消费该迭代器，先按实际落宫数量预留容量，再逐颗移入宫位，不先物化 `[Star; 18]`。本命、大限、流年共享私有宫职布局函数；宫干四化用单次遍历产生的临时落宫索引读取四个目标，不缓存。公开 API、完整即时构建的 `Natal`、领域字段、`Box<[Star]>` 与排盘规则不变，无新依赖或 `unsafe`。 | 2026-09-07 授权优化并验证；容量策略由 D-235 修订；Box、临时索引和无新依赖约束由 D-238 修订并落地 |
| D-233 | 借鉴旧 Rust 的编译期安星思路，在 `rules.rs` 中由原公式生成 `12 × 14` 主星表、`12 × 2` 月系辅星表和 `12 × 2` 时系辅星表。`compute_star_branches` 的签名与十八星顺序不变，运行时选取主星行并合入四颗辅星；主星公式改为 `const fn` 供编译期生成，辅星公式在各自常量初始化中求值。不恢复 D-212 排除的五局三十日紫微定位表，不展开十二宫组装、不改变领域对象或公开 API，不新增生产文件、依赖或缓存。沿用独立固定落宫样例验证全部 `1,728` 种组合，并以当前公式版进行两入口建盘配对测量。 | 2026-09-07 授权执行并完成测量 |
| D-234 | 将 D-233 的月系、时系辅星表合并为 `MINOR_STAR_BRANCH_PAIRS: [[Branch; 2]; 12]`，每行保存相同零基偏移下的“辰顺布、戌逆布”地支。月份减一读取左辅、右弼；时辰索引读取文曲、文昌，再按既定左辅、右弼、文昌、文曲顺序输出。主星表、公开接口、领域模型和安星规则不变；仍分别读取月、时两行，不声称减少运行时查表次数。显式解构并直接组装十八星数组已试验，测量变慢，未保留；继续使用原有分段复制组装。 | 2026-09-07 授权分步验证；保留表合并作为代码简化，测量差异小于 1%，未确认提速 |
| D-235 | 宫内星曜采用固定容量内联存储，不做运行时自动扩容或堆回退。当前容量为 6，仅作为私有实现常量，不向调用方公开，也不定义永久领域上限；新增星曜或改变安星规则时，同步重算容量并更新覆盖测试。`Palace::stars() -> &[Star]`、只读性质与宫内星序保持不变，超容量不得静默丢弃星曜。当前十八星的单宫最大值依据 1,728 种落宫组合的隔离实验确认，不外推到未来规则。槽位枚举的验证进展见 D-236；Star 紧凑存储由 D-237 落地，最终容器由 D-238 确定，不把组合实验的耗时降幅视为单独改变 Palace 即可获得的收益。 | 2026-09-07 用户确认容量策略；ArrayVec 容器已由 D-238 落地 |
| D-236 | 用户同意隔离验证私有 `PalaceStars` 枚举：分别持有空集合或 1～6 颗真实 Star，不构造占位星曜，保留切片读取、顺序与 Clone/Eq/Debug，无新增生产文件、依赖或 unsafe。验证正确且零分配，但保留当前 72 B Star 时建盘变慢；结合尚未确认的紧凑 Star 才获得明显建盘收益，同时宫干四化查询稳定退化约 30%。不将验证授权视为紧凑 Star 或查询性能取舍的确认。 | 2026-09-07 授权验证并完成隔离实验；不合入正式源码，最终布局待定 |
| D-237 | 用户授权执行全流程 review 的顺序：先补齐混合输入、所有星曜查找／四化聚合、名称和保留命盘的独立负载，再分别验证紧凑 Star 与固定容量容器。采用紧凑 Star：私有静态资料按 StarName 索引，实例不重复携带名称／简称引用；四个 const getter、其他事实、构造参数、Clone/Eq 和原 Debug 内容不变。修订先前对 Star 名称实例字段的存储约束，不改变公开 interface 或领域规则。Box 组装暂保留；完整读取对照发现枚举有多项聚合退化，连同未解决问题的非内联遍历试验不合入。旧 construction-120 合同、无缓存／无 unsafe／无新依赖约束不变。 | 2026-09-07 用户授权执行；紧凑 Star 和独立基准已实现 |
| D-238 | 在紧凑 Star 基础上，分别验证固定容量容器、位置索引与组合后，用户明确接受名称遍历、大限查询和保留命盘 RSS 的代价，合入 `ArrayVec<Star, 6>` 与十八项私有星曜位置索引。ArrayVec 0.7.8 关闭默认特性，封装底层 unsafe；自有源码仍禁止 unsafe。容量私有，仅保存真实星曜，超容量显式失败，不扩容或堆回退。`Natal::new` 从最终宫位一次建立宫位／宫内下标，不保存自引用。星曜、落宫、生年四化及宫干四化直接定位，自化仍顺序遍历，限运仍按需计算。公开 interface、借用、顺序、Clone/Eq/Debug、规则与旧基准合同不变，不缓存查询结果。修订 D-228、D-232、D-237 中不增私有字段、保留 Box 和零新增依赖的约束。 | 2026-09-07 用户确认取舍；已合入工作区，未提交推送 |
| D-239 | 收尾 #326：查询沿用已确认的 `Natal` 只读方法与返回语义；V1 Rust 核心以 `ZiweiError` 变体及载荷作为机器可匹配的错误合同，不新增字符串或数字错误码接口。跨语言稳定错误码、宿主边界错误及异常包装在 Node/Wasm 绑定实现时确定并验证，不从 `Display`、`Debug` 或 Rust 内存布局推导。计算追踪明确延期到 V1 之后，当前不提供追踪 API、过程记录、绑定输出或对应验收要求；恢复时重新设计内容、开销和生命周期。 | 2026-09-08 用户确认并授权执行；文档已同步，现有 Rust API 与行为不变 |
| D-240 | 增加 `Natal::decade_palace_by_name(decade: DecadeIndex, name: PalaceName) -> &Palace` 和 `yearly_palace_by_name(decade: DecadeIndex, yearly: YearlyIndex, name: PalaceName) -> &Palace`。按指定期间宫职直接定位本命实际宫位，返回的宫名、宫干、星曜仍为本命事实；不创建期间宫位副本或新增字段。规则层与完整期间布局共享命宫计算，单宫定位不生成数组、不扫描布局、不缓存、不分配堆内存。年龄反查与三方四正的待定语义不纳入本轮。 | 2026-09-08 用户授权并发执行新增查询；实现与验证在本轮完成 |
| D-241 | 增加 `Natal::palace_transformation_sources(target_branch: Branch) -> impl Iterator<Item = PalaceTransformation> + '_`，筛选既有单步宫干四化。按源宫寅至丑、各源宫 A/B/C/D 顺序返回所有命中，同宫关系和同源不同化象均保留；无命中时为空。不缓存、不分配堆内存，不创建全盘关系表或连续路径。实现复用逐源宫查询，完整消费最多检查四十八条关系。 | 2026-09-08 用户授权并发执行新增查询；已实现；方法名由 D-245 修订，语义不变 |
| D-242 | 增加 `Natal::period_indices_at_age(age: u8) -> Option<(DecadeIndex, YearlyIndex)>`。局数为 `b` 时只匹配 `[b, b + 119]`，返回 `(offset / 10, offset % 10)` 的有效索引；`0`、起限前、超出十二大限范围均返回 `None`，不循环、不截断、不新增错误类别。先安全减去局数再检查偏移，不依赖数字出生年份或顺逆，不生成期间数组或摘要、不缓存、不分配堆内存。 | 2026-09-08 用户确认设计并授权执行；已实现 |
| D-243 | 增加 `Natal::decade_by_branch(decade: DecadeIndex, branch: Branch) -> Decade`、`yearly_by_branch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch) -> Yearly`。按实际地支直接生成单个期间宫职，保留对应对象的身份与简繁名称，按值返回而非借用或可选值；不新增字段、不修改本命宫职。规则层与整盘布局共享期间命宫和宫职计算，不先生成十二项数组、不缓存、不分配堆内存。 | 2026-09-08 用户确认设计并授权执行；已实现 |
| D-244 | 增加 `Natal::opposite_palace(branch: Branch) -> &Palace`，直接定位相隔六宫的本命实际宫位，返回当前命盘的借用；不接收外来宫位引用、不复制宫位或星曜、不受期间宫职影响，不附加解释或三方四正语义。 | 2026-09-08 用户确认设计并授权执行；已实现 |
| D-245 | 将 `Natal::palace_transformations_to` 改名为 `palace_transformation_sources`，表达“查询某宫的四化来源”。参数 `target_branch: Branch`、关系迭代器返回类型、源宫与化象顺序、同宫及同源多条关系、惰性计算均不变；同步公开调用、测试与文档，不保留旧名别名。 | 2026-09-08 用户确认命名并授权执行；已实现 |
| D-246 | 增加 `Natal::sanfang_palaces(branch: Branch, include_self: bool) -> impl ExactSizeIterator<Item = &Palace> + '_` 与 `sizheng_palaces(branch: Branch) -> [&Palace; 4]`。三方不含本宫时按实际地支正序偏移 `[4, 8, 6]` 返回两个三合宫及对宫；包含本宫时按 `[0, 4, 8, 6]` 返回四正，与四正直接入口一致。固定偏移定位后返回当前命盘的借用，无重复、不滤空宫、不修改本命或期间事实，不新增领域对象、缓存或堆分配。 | 2026-09-08 用户要求新增三方与四正，并指定由参数控制是否包含本宫；本轮实现合同 |
| D-247 | 增加 `Natal::palace_transformation(source_branch: Branch, kind: Transformation) -> PalaceTransformation`，直接查询源宫指定的一种宫干四化；合法化象必有唯一结果，同宫关系保留。规则层复用十干四化表和本命星曜位置索引，仅构造一条关系，不生成完整四项结果、不分配堆内存、不缓存、不修改本命事实。`Transformation::index()` 从测试辅助扩展为 crate 内部生产索引，仍不公开；既有批量查询合同不变。 | 2026-09-08 用户确认单项与批量区别并授权执行；已实现 |

### Node.js/TypeScript 适配设计与实施进展

| ID | 决策 | 状态 |
| --- | --- | --- |
| D-248 | Node.js/TypeScript 使用冻结的 Ziwei 入口对象，只含 fromBirth/fromParameters；Natal 只导出类型并持有 Rust 核心，不公开构造器或句柄。Palace/Star 为独立深层只读普通数据；数字身份和字符串身份按 [Node 适配设计](node-api-design.md) 显式映射，名称字段使用 nameHans/nameHant 等，不增加 Lang 或全局状态。 | 2026-09-09 用户授权自主完成设计；声明与文档已落地，绑定未实现 |
| D-249 | Node 完整覆盖当前 28 个 Natal 读取/查询方法，将 Palace::star 保留为 natal.palaceStar(branch, name)，未命中返回 null；增加 toJSON 作为无行为快照出口。单项查询不依赖全盘快照；期间、关系、缺失值和顺序沿用核心，所有查询同步，不增加批量、连续飞化或解释能力。 | 2026-09-09 委托设计选择；实施与运行时验收后续进行 |
| D-250 | Node 的 profile、palaces 分别首次成功访问后深层冻结并按实例保存，重复读取保证同一对象；其他查询不缓存，不保证与属性快照或不同查询之间引用相等。输出不反向持有原生命盘，不提供主动释放或跨 Worker 原生对象传递。Rust 的存储、借用、无查询缓存及按需限运约束不变。 | 2026-09-09 在完整查询设计后确定的实施基线，不是已验证的性能胜出结论 |
| D-251 | Node 错误使用中文 ZiweiError，含 code 与判别联合 detail；五类核心错误码逐项映射变体，另设 INVALID_ARGUMENT 表达宿主表示错误。数字在整数收窄前验证；null 表示已确认的缺失，年数值保持精确。补全 D-239 的宿主设计，不在 Rust 核心新增错误码，不通过 Display/Debug/内存布局推导协议。 | 2026-09-09 委托设计选择；类型合同已编写，原生异常与平台支持尚未验证 |
| D-252 | 绑定目录按宿主组织：Node 使用 `bindings/node`，Rust 绑定与 TypeScript 门面共同放置，Cargo 包名保留 `ziwei-napi`，npm 包名仍拟定为 `@matharts/ziwei`。未来 Wasm 使用平级的 `bindings/wasm`，Cargo 包名保留 `ziwei-wasm`；两者各自单向依赖核心。不因目录规划预先创建空包，不改变公开合同、领域职责或依赖方向。 | 2026-09-09 用户确认社区布局调研建议并要求执行；仅同步设计，绑定目录与 manifest 尚未创建，npm 名称与 scope 权限未核验 |
| D-253 | 在 `bindings/node` 实现首个可运行切片：两个同步建盘入口、持有核心 Natal 的私有原生对象、按实例惰性只读 Profile、Gender/Stem/Branch 数字常量及中文结构化错误。实际包声明只公开已实现成员，完整设计声明继续作为目标；其余查询、ALL/派生方法和 toJSON 待实施。根 workspace 加入 ziwei-napi，default-members 保持核心；mise 锁定 Node/pnpm，CI 接入构建与 Node 测试。仅绑定使用 deny(unsafe_code) 兼容 napi-rs 注册宏，核心 forbid 不变；原生 holder 记账及环境回收不涉及 JS 快照。 | 2026-09-09 用户要求执行下一实施切片；本地包入口、类型、Worker、离线打包消费端已验证；禁止发布，远端 CI 与完整平台/性能矩阵尚未验证 |
| D-254 | 保留 Node 同包布局与现有目录；将原生命盘持有、Profile 转换、结果包装及记账回收迁入私有 `src/natal.rs`，将 TS 私有命盘包装、冻结及实例缓存迁入 `js/natal.ts`。`src/lib.rs`、`js/index.ts` 保留构造与导出职责，内部辅助函数不进入公开包根或子路径。不改变 D-248～D-251 合同，不新增查询、包或发布流程。 | 2026-09-09 用户确认目标结构并要求执行；对象模块提取已完成，构建、11 项 Node 测试、NodeNext/Bundler 类型检查、Cargo 测试及 fmt/Clippy 通过；既有公开声明与配置不变，未提交、推送或发布 |
| D-255 | 实现已确认 Node 合同中的 zodiac、fiveElementBureau、palaces 及配套身份常量、Palace/Star/SelfTransformations/DecadeAgeRange 类型。宿主身份以穷尽枚举转换确定，名称读取核心；宫位和宫内星序保持不变。palaces 与 profile 独立，分别首次成功读取后深层冻结并按实例保存；失败不缓存，子数据不持有原生句柄。不新增查询、限运、ALL/派生方法、toJSON、Wasm 或发布流程，不修改核心规则与存储。 | 2026-09-09 用户确认本命只读数据切片；按测试先行完成，甲子与壬申固定命例、16 项 Node 测试、21 个类型负例及 NodeNext/Bundler、Cargo 测试、fmt/Clippy、Rust 1.98.0 检查通过；未提交、推送、发布或验证其他平台/性能 |
| D-256 | 按既定 D-248～D-251 合同完成剩余 Node API：本命定位与宫位关系、四化、按需大限／流年、ALL／身份派生方法及 toJSON。只调用核心公开方法，查询按请求范围转换并深层冻结，不新增查询缓存；两个属性的独立缓存合同不变。保持安全整数年份、缺失值与结构化错误，非法接收者及意外异常不伪装为领域错误；生成声明与完整目标一致。 | 2026-09-09 用户要求直接完成绑定包；28 项 Node 测试、30 个类型负例、NodeNext／Bundler、独立 ESM／CJS 打包消费端、Worker／GC、Rust debug／release、fmt／Clippy 和 1.98.0 检查通过。核心与依赖不变，文档同步；未提交、推送、发布，跨平台与性能未验证 |
| D-257 | 取代 D-252 的 Node 同目录布局：Rust adapter 迁至 `crates/ziwei_napi`（Cargo 包保留 `ziwei-napi`），TypeScript 门面迁至 `packages/core/src`，npm 包改为 `@ziweijs/core`。根 pnpm workspace 管理 `packages/*` 和共享锁文件；JS 包通过显式 Rust manifest 构建自己的 native 产物。参考 Rolldown 的 Rust／TS 分离，保留 D-254 模块职责与 D-248～D-251 公开合同；不创建占位包、不升级依赖、不实施 Wasm 或发布。 | 2026-09-09 用户明确要求多包、改名及 Rust／TS 分离；迁移完成，离线冻结安装、28 项 Node 测试、NodeNext／Bundler、独立打包消费端、Rust debug／release、fmt／Clippy 与 1.98.0 检查通过。源码及生成声明保持一致；未提交、推送、发布，远端 CI 未运行 |

#### 包工程与开发入口

| ID | 决策 | 状态 |
| --- | --- | --- |
| D-258 | npm 默认单份 ESM，根 `exports` 同时服务 import 与 require(ESM)，不保留 CJS 双构建／桥接。最低 Node 统一 >=24.15.0，mise 开发仍固定 24.20.0；前者涵盖已稳定的 TS 类型擦除与 require(ESM)。手写 Node 源码、配置、测试、Worker 和工具全部使用 TypeScript，生成 JS／native 加载器继续作为分发产物。pnpm 默认 Catalog 集中直接依赖版本，各包使用 catalog:。不改变 Rust、公开导出和领域语义，不发布。 | 2026-09-09 用户要求 ESM、Node 对齐、Catalogs 和全量 TS；本次包工程实施范围，验证状态以实际检查为准 |
| D-259 | 开发任务统一由 mise 定义和编排；移除 Node 自建任务调度器，根及 core 的 package.json 不保留重复 scripts。Node 单项任务直接启动已安装 CLI，并保留 pnpm 的 devEngines 校验；普通 mise 任务不承诺任意参数保真，复杂参数通过 mise exec 直接启动 CLI。基准复用同一构建任务并追溯 mise 配置，不改变排盘 API、语料、采样或统计。 | 2026-09-09 用户选择 mise 作为唯一任务入口；本地与跨平台验证分别报告 |
| D-260 | 按职责区分 `crates/`（Rust 引擎）、`bindings/`（按宿主组织的 Rust adapter）与 `packages/`（JavaScript／TypeScript 包）。Node Rust adapter 迁至 `bindings/node`，Cargo 包由 `ziwei-napi` 改为 `ziwei-node`（Rust 标识符 `ziwei_node`）；调整 D-257 的绑定路径和 Cargo 包名，保留其 Rust／TS 分离、`packages/core` 与 `@ziweijs/core`。绑定继续加入根 Cargo workspace、单向依赖 `ziwei`，不引入独立绑定 workspace 或第二套领域实现；其他宿主在实施时加入，不创建空包。同步构建、测试、指纹路径与文档，不改变公开 API、生成产物名称、生命周期、冻结／缓存合同、测量负载或统计。 | 2026-09-10 用户确认多宿主目录与命名方案；本轮结构迁移，验证结果以实际检查为准；未提交、推送或发布 |
| D-261 | npm 包由 `@ziweijs/core` 改为 `@matharts/ziwei`，同步包自引用、Rstest 外置模块、类型与独立消费端测试、基准入口和使用文档；不保留旧包名别名。保留 `packages/core` 目录、`bindings/node` 与 Cargo 包 `ziwei-node`，原生二进制基名仍为 `ziwei-native`。只改变 npm 身份与导入路径，不改变方法、类型、领域行为、测量负载、工具链或依赖版本；继续禁止发布。 | 2026-09-10 用户明确要求修改 TS 包名；验证结果以实际检查为准；未提交、推送或发布 |
| D-262 | TypeScript 包目录由 `packages/core` 改为 `packages/ziwei`，Rstest 包测试项目名同步改为 `ziwei`；更新 mise 工作目录、TypeScript 检查范围、pnpm 锁文件的 workspace 路径、工程测试、基准指纹与文档链接。保留 D-261 的 npm 包名 `@matharts/ziwei`、D-260 的 `bindings/node` 与 Cargo 包 `ziwei-node`；不改变公开 API、依赖版本、运行时要求或测量负载，不新增包与兼容目录。 | 2026-09-10 用户要求将 core 改为 ziwei；本次目录迁移，验证结果以实际检查为准；未提交、推送或发布 |
| D-263 | Node 采用一个用户入口 `@matharts/ziwei` 与按平台分发的原生产物包，不增加转发包或 Rust crate。参考 Rolldown 的十五个原生目标，首批为 macOS／Windows x64、arm64 与 Linux x64、arm64 的 glibc／musl，共八项；其余七项保留候选，WASI 另议。源码 manifest 保持私有且不依赖未发布包；独立暂存区按显式选择且产物齐全的目标生成精确同版本 optionalDependencies，主包不含 `.node`。保留本机开发加载，新增真实拆包消费端验收与对应 CI；所有包继续 private，不授权发布或把配置当作已验证支持。 | 2026-09-10 用户确认 Rolldown 对照方案并要求执行；详见 [Node 分发设计](node-distribution-proposal.md) |
| D-264 | Node CI 在单目标验收后封存已测试的 tarball，以同一提交、run ID 与 attempt 汇总完整目标集，校验版本、SHA-256 和公共文件一致性。平台 tarball 保持原样，主包只重组完整精确版本依赖。允许本批 GitHub Actions 产物上传／下载；保留 private，不扩平台、不改公开 API、不发布 npm。完整汇总不替代后续注册表自动平台选择验收。 | 2026-09-10 用户确认同批八平台产物汇总并要求执行；详见 [同批产物封存与汇总](node-distribution-proposal.md#同批产物封存与汇总) |

## 暂缓决策

| ID | 决策 | 状态 |
| --- | --- | --- |
| D-021 | 连续飞化可从一条确定的宫干四化关系开始；同时支持指定一个源宫并返回禄、权、科、忌四组路径。 | 暂缓；不进入 V1 API、实现或测试 |
| D-022 | 一条飞化到达的目标宫同时存在自化与生年四化时，两种事实均各自生成连续飞化分支。 | 暂缓；恢复功能时重新核验 |
| D-023 | 连续飞化遇自化时的续飞与终止规则。 | 暂缓；未决 |
| D-024 | 连续飞化遇生年四化和无特殊事实时的续飞规则。 | 暂缓；未决 |
