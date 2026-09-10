# 紫微斗数上下文

已按 2026-09-08 当前工作区同步。以下字段写法用于说明事实归属，不代表字段可直接访问；公开读取以源码中的方法为准。当前存储与计算过程见 [包架构](docs/architecture/rust-package-design.md)，已确认规则的权威及修订历史见 [决策记录](docs/architecture/v1-decision-map.md)。

## 统一语言

### 输入与校验

- **`Birth`**：由历法层归一化后的农历出生资料；包含 `gender`、数字农历 `birth_year`、`birth_month`、`birth_day`、`birth_hour`。历法换算、闰月辨识和实际日期有效性不属于引擎。

- **`Parameters`**：直接排盘参数；包含 `gender`、组成有效六十甲子年柱的生年干和生年支、`birth_month`、紫微星所在实际宫位的 `ziwei_branch` 和 `birth_hour`。它只能经 `new` 构造；构造成功即保证生年干支有效。它不含数字年份、`day`；紫微宫位地支由调用方负责正确性。

- **`ZiweiError`**：核心公开的统一错误类型；包含 `InvalidSexagenaryYear { stem, branch }`、`InvalidLunisolarMonth { value }`、`InvalidLunisolarDay { value }`、`InvalidDecadeIndex { value }`、`InvalidYearlyIndex { value }` 五类可验证边界错误。核心 `Display` 使用固定中文诊断；它不是可配置的本地化接口。

- **`BirthMonth`**：仅允许数值 `1..=12` 的归一化阴阳历出生月份；以 `get() -> u8` 读取已验证数值，不记录闰月信息，也不承担历法换算或中文格式化。

- **`BirthDay`**：仅允许数值 `1..=30` 的归一化阴阳历出生日；以 `get() -> u8` 读取已验证数值，不承担具体月份天数或历法换算校验，也不承担中文格式化。

- **六十甲子年柱**：生年干和生年支阴阳相配的组合；天干索引与地支索引的奇偶必须相同。

### 领域身份与名称

- **宫职（`PalaceName`）**：命、兄弟、夫妻、子女、财帛、疾厄、迁移、交友、官禄、田宅、福德、父母十二种共享的稳定身份。本命 `Palace`、大限 `Decade` 与流年 `Yearly` 各自持有同一个 `PalaceName` 领域值；不再引入 `PalaceRole` 或 `PalaceScope`。

- **领域名称与本地化名称**：`PalaceName` 与 `StarName` 是可参与排盘和查询的稳定领域身份；`Palace`、`Decade`、`Yearly` 各自管理所持宫职在对应期间层级的简体、繁体名称，`Star` 直接提供星曜的简体、繁体名称。只有 `name_hans`、`name_hant` 等本地化字符串不参与排盘或规则选择。

- **阴阳**：独立的 `YinYang` 基础领域身份 `Yin` 或 `Yang`。天干、地支及性别都可映射到其中之一，但不替代 `Gender`。

- **性别**：`Gender` 的稳定身份 `Female` 或 `Male`。

- **五行**：基础领域身份 `Water`、`Wood`、`Metal`、`Earth` 或 `Fire`。它不同于带局数的五行局。

- **天干**：`Stem` 的十个拼音稳定变体；`Stem::ALL` 以甲至癸的固定顺序公开全集，并与 `index() -> u8` 返回的 `0..=9` 对齐；固定简体 `Display` 只参与面向人的中文诊断。作为生年天干时，它按五虎遁唯一确定寅宫起干及十二宫干。

- **地支**：`Branch` 的十二个拼音稳定变体；`Branch::ALL` 以子至亥的固定顺序公开全集，并与 `index() -> u8` 返回的 `0..=11` 对齐；固定简体 `Display` 只参与面向人的中文诊断。十二宫的稳定展示顺序另为寅至丑。

- **生肖**：与十二地支一一对应的基础领域身份：鼠、牛、虎、兔、龙、蛇、马、羊、猴、鸡、狗、猪；由 `Zodiac` 枚举 `Rat`、`Ox`、`Tiger`、`Rabbit`、`Dragon`、`Snake`、`Horse`、`Goat`、`Monkey`、`Rooster`、`Dog`、`Pig` 保存。

### 本命盘与宫位

- **`Natal`**：由两类输入收敛后的统一排盘路径确定的不可变本命盘事实；不保留调用方原始输入、输入来源或仅为构建服务的临时值。它通过 `Profile` 持有归一化出生档案，并在顶层保存由生年地支确定的 `zodiac: Zodiac`。

- **`Profile`**：由 `Natal` 持有的归一化出生档案；承载后续期间计算与调用方读取所需的出生事实，但不记录原始输入或输入来源。其中 `birth_year: Option<i32>` 是数字年份锚点：`Birth` 有值，`Parameters` 无值；它不引入历法换算、范围或日期有效性校验；`gender: Gender` 保留完整的归一化性别事实，固定为 `Female` 或 `Male`；`birth_stem: Stem` 与 `birth_branch: Branch` 直接承载生年干支；`birth_month: BirthMonth` 保存归一化出生月份，不区分闰月；`birth_hour: Branch` 保存十二时辰对应的地支；`birth_day: Option<BirthDay>` 保存归一化农历日，`Birth` 有值，`Parameters` 无值。它不重复保存紫微所在地支和生肖：前者由 `Natal` 顶层的紫微星宫位定位保存，后者由 `birth_branch` 唯一映射取得。

- **命宫地支**：寅宫起正月，顺数至出生月，再逆数出生时辰所得的地支；`Natal::ming_palace_branch: Branch` 以它定位唯一的命宫，命宫名由对应实际宫位读取，不重复保存。

- **身宫**：寅宫起正月，顺数至出生月，再顺数出生时辰所得的实际宫位；`Natal::shen_palace_name: PalaceName` 与 `Natal::shen_palace_branch: Branch` 共同定位唯一的身宫。

- **五虎遁**：生年天干先归入五组之一：甲己丙寅、乙庚戊寅、丙辛庚寅、丁壬壬寅、戊癸甲寅；再从寅宫顺布十二宫干。因此它只有五种十二宫排布（`5 × 12`），每种排布都会在十二宫内重复两个天干。

- **来因宫**：由生年天干到地支的固定表定位的实际宫位：甲戌、乙酉、丙申、丁未、戊午、己巳、庚辰、辛卯、壬寅、癸亥；`Natal` 使用 `origin_palace_name: PalaceName` 与 `origin_palace_branch: Branch` 同时定位它。不得从五虎遁结果扫描“唯一同干宫位”推导来因宫。

- **紫微星宫位**：`Natal` 使用 `ziwei_palace_name: PalaceName` 与 `ziwei_branch: Branch` 同时定位包含紫微星的唯一宫位。

- **宫位**：十二地支之一承载的实际本命宫位；持有 `name: PalaceName`、宫干、星曜和大限年龄区间事实。`Palace` 自行管理本命宫职及其名称，不通过作用域枚举包装。按 D-238，星曜使用私有固定容量内联存储，对外仍借用 `&[Star]`；当前容量 6 不是永久领域上限。

- **星曜位置索引**：按 D-238，`Natal` 构造时从最终十二宫建立十八项私有位置索引，每项记录宫位和宫内星曜下标，不保存自引用。索引服务不可变命盘查询，克隆、移动后仍借用各自存储；不属于公开领域事实，不进入 Debug 或绑定输出，也不是按需生成的查询结果缓存。

### 星曜与四化

- **星曜**：具有稳定名称身份、类别与星系，并在具体命盘中落入一个宫位的对象。`Star` 持有私有字段 `name: StarName`、`category: StarCategory`、`galaxy: StarGalaxy`、`birth_transformation: Option<Transformation>`、`self_transformations: SelfTransformations`，并以同名只读方法公开这些事实。按 D-237，名称和简称改由身份索引编译期静态资料，实例不重复持有字符串引用；`name_hans`、`name_hant`、`abbr_hans`、`abbr_hant` 四个 const 读取方法及 Debug 内容保持不变。`StarName::ALL` 以固定顺序公开十八星全集，供稳定遍历，crate 内 `index()` 与其数组下标对齐以服务后续落宫规则。V1 固定为十四正曜与左辅、右弼、文昌、文曲，共十八星；类别与星系归属逐项确认。

- **星曜简称**：星曜用于盘面的单字中文名称；`Star` 通过 `abbr_hans`、`abbr_hant` 读取静态资料。它由星曜名称唯一确定，不参与排盘或规则选择。

- **星曜类别**：`Major`、`Minor`、`Auxiliary` 三类之一。十四正曜为 `Major`；左辅、右弼、文昌、文曲为 `Minor`；当前 V1 的十八星没有 `Auxiliary` 成员。

- **星曜星系**：`South`、`Central`、`North` 三类之一。`South` 为太阴、贪狼、巨门、天梁、破军；`North` 为太阳、武曲、天同、廉贞、天机；其余八星为 `Central`。

- **四化**：按稳定顺序排列的禄、权、科、忌四种变化身份。

- **名称归属**：本命宫职名称属于 `Palace`，大限宫职名称属于 `Decade`，流年宫职名称属于 `Yearly`，星曜名称与简称属于 `Star`；稳定名称身份本身不承担公开本地化接口。名称不包括界面说明、错误消息、基础值显示或其他语言。

- **四化类别**：`Transformation` 的稳定身份 `A`、`B`、`C`、`D`，依次对应禄、权、科、忌；`Transformation::ALL` 以此固定顺序公开全集。`index()` 是 crate 内部的四化表下标，供单项宫干四化查询和规则对照使用，不属于公开方法。

- **生年四化**：由生年天干确定的四条独立本命事实，分别由目标星曜的 `birth_transformation: Option<Transformation>` 承接；全盘可按禄、权、科、忌顺序聚合。壬干化科为左辅。

- **宫位四化**：由源宫宫干发出并命中目标星曜的一条关系。每宫四条，全盘四十八条；按需计算，不存入本命对象。同宫关系保留。源宫、目标宫均由实际地支定位，批量 API 见 D-229。单项入口 `Natal::palace_transformation(source_branch, kind)` 按指定化象直接返回唯一的 `PalaceTransformation`，不生成完整四项结果、不缓存、不分配堆内存，见 D-247。

- **向心自化**：宫位四化的目标落在源宫对宫时，目标星曜承接的自化事实；它由目标 `Star::self_transformations.inward: Option<Transformation>` 保存。

- **离心自化**：宫位四化的目标落在源宫本宫时，目标星曜承接的自化事实；它由目标 `Star::self_transformations.outward: Option<Transformation>` 保存。

- **连续飞化**：暂缓的未来功能；当前 V1 不定义其规则，也不提供相关 API、实现或测试。

### 五行局与限运

- **五行局**：由命宫干支确定的水二、木三、金四、土五、火六之一；`FiveElementBureau` 不提供 `element()` 或 `number()` 等组成部分读取方法。按 D-114 保留 `#[repr(u8)]` 与 2～6 的判别值，Rust 的 `as u8` 可观察该数值；不把“无读取方法”解释为数值不可见。

- **限运**：以本命盘为基础按时间层级展开的期间性命盘信息；可由大限继续细分为流年、流月、流日与流时，当前 V1 只包含大限和流年。

- **大限宫职**：一个 `Decade` 表示某个实际宫位在指定大限中的宫职；其宫职身份使用 `PalaceName`，并由 `Decade` 自身管理对应的大命、大兄、大夫、大子、大财、大疾、大迁、大友、大官、大田、大福或大父名称。

- **大限顺逆**：大限在十二实际宫位间的排列方向，由 `DecadeDirection` 表示。阳男、阴女顺行，阴男、阳女逆行。

- **大限**：本命盘上的按需期间计算。零基序号 `d` 取值 `0..=11`；起始虚岁为五行局数加 `10 × d`，连续十年。各实际宫位保存对应的大限年龄区间；`Natal` 与 `Palace` 均不预存十二大限的宫职布局，调用 `Natal::decade(DecadeIndex)` 时即时生成按实际宫位固定顺序排列的 `[Decade; 12]`，核心不缓存。大限命宫从本命命宫按大限顺逆移动 `d` 宫，其余宫职始终从大命逆布；顺逆只决定大命的位置，不改变宫职的排列方向。序号由 `DecadeIndex` 校验，方法直接返回数组，不重复校验或引入额外错误。

- **大限年度摘要（`DecadeYear`）**：`Natal::decade_years(DecadeIndex)` 按需返回时间递增的 `[DecadeYear; 10]`，数组位置对应大限内 `0..=9` 的流年序号。每项只保存 `age: u8` 与 `year: Option<i64>`，不包含流年宫职，也不缓存。虚岁为五行局数加 `10 × 大限序号` 再加流年序号，与顺逆无关；数字年份为出生年份加虚岁减一，计算前先扩宽到 `i64`，不跳过零年。`Birth` 与 `Profile` 的数字出生年份仍使用 `i32`；`None` 仅表示缺少数字出生年份，不表示溢出或历法无效。

- **流年宫职**：一个 `Yearly` 表示某个实际宫位在指定流年中的宫职；其宫职身份使用 `PalaceName`，并由 `Yearly` 自身管理对应的流命、流兄、流夫、流子、流财、流疾、流迁、流友、流官、流田、流福或流父名称。

- **流年**：一个大限内的按需期间计算。零基序号 `i` 为 `0..=9`；虚岁为五行局数加 `10 × d + i`。未选择 `i` 时，按需生成固定的十项大限年度摘要；选择 `i` 时，通过 `Natal::yearly(decade: DecadeIndex, index: YearlyIndex) -> [Yearly; 12]` 生成十二宫职，按寅至丑与 `palaces()` 逐项对应。流年命宫坐该流年年支，即生年支加虚岁减一（模十二），并从该命宫逆布十二流年宫职；不受大限顺逆影响，不依赖数字出生年份，也不先生成大限布局或年度摘要。两种输入均支持，索引范围由值类型保证，查询直接返回数组，不缓存、不修改本命事实。

### 定位与关系查询

- **期间宫职定位查询**：`Natal::decade_palace_by_name` 与 `yearly_palace_by_name` 按指定期间的 `PalaceName` 返回唯一实际宫位的 `&Palace`。它们直接定位，不生成完整期间数组、不分配堆内存、不缓存。返回对象的 `name()` 仍为本命宫职，宫干和星曜仍为本命事实；期间宫职仅作为查询条件，不写回 `Palace`。

- **宫位四化来源查询**：`Natal::palace_transformation_sources(target_branch)` 按目标实际地支筛选既有宫干四化，返回按值生成的关系迭代器。顺序为源宫寅至丑、各源宫 A/B/C/D；保留同宫及同源不同化象的关系，无命中时为空。不缓存、不分配堆内存、不构造连续飞化路径。

- **虚岁定位期间**：`Natal::period_indices_at_age(age: u8)` 返回 `Option<(DecadeIndex, YearlyIndex)>`。五行局数为 `b` 时，仅匹配 `[b, b + 119]`；`0`、起限前和超出十二大限范围均返回 `None`，不循环、不截断、不新增错误类别。输入是虚岁，计算不依赖数字出生年份或大限顺逆，也不生成年龄摘要或期间布局。

- **实际宫位的期间宫职**：`Natal::decade_by_branch`、`yearly_by_branch` 按实际地支分别生成一个 `Decade`、`Yearly` 值。复用整盘期间布局的宫职规则，不先生成十二项数组；两种入口均支持，不新增存储字段，不修改本命宫职。

- **对宫查询**：`Natal::opposite_palace(branch)` 返回与指定实际地支相隔六宫的本命 `&Palace`，借用当前命盘，不受期间宫职影响，不复制宫位或星曜。

- **三方与四正查询**：`Natal::sanfang_palaces(branch, include_self)` 返回定长可知的宫位借用迭代器；不含本宫时依次为沿地支正序偏移四宫、八宫的两个三合宫，以及偏移六宫的对宫，共三项。包含本宫时将本宫放在首位，共四项，即四正。`Natal::sizheng_palaces(branch)` 直接返回同序的 `[&Palace; 4]`。查询定位实际宫位，不改变期间宫职或本命事实，无重复、不缓存、不分配堆内存，不附加会照解释。

## 上下文边界

### 宿主适配与工程

- D-263 的[Node 分发设计](docs/architecture/node-distribution-proposal.md)将用户入口主包与原生产物包分开。首批八目标进入构建／验收配置，另七目标保留候选；平台包仅为分发产物，不是领域模块。源码 workspace 不依赖未发布平台包；独立暂存区按本次完整产物集生成精确版本依赖，主包不含 `.node`，所有包继续禁止发布。D-264 增加同一提交／run／attempt 的产物封存与全目标汇总，Actions 产物仅用于验收；平台配置、实测通过、完整汇总与注册表分发是不同状态。

- 按 D-259，开发任务统一由 mise 定义和编排，pnpm 保留依赖管理与开发版本校验；任务使用和参数边界见 [工程验证](docs/agents/engineering.md)。这一工程选择不改变领域与宿主 API。

- Node 工程使用 Oxlint 与 Oxfmt，依赖纳入根 Catalog，检查和修复均通过 mise；提交钩子与 CI 只检查，Rust 保留 rustfmt 与 Clippy。范围与生成文件边界见 [Lint 与格式化](docs/agents/engineering.md#lint-与格式化)。

- Node 包工程约束见 D-258：单份 ESM、最低 Node 24.15.0、手写代码全量 TypeScript、pnpm Catalog 集中依赖版本。它们不改变领域事实、公开查询语义或 Rust 与宿主的职责边界。

- Node.js/TypeScript 的完整宿主合同见 [适配设计](docs/architecture/node-api-design.md)（D-248～D-251）。D-253、D-255、D-256 已实现两个建盘入口、全部本命与限运查询、只读属性、ALL／派生方法、结构化错误和 `toJSON`。宿主 Natal 持有核心；`profile` 与 `palaces` 分别首次成功读取后冻结并按实例保存，其余查询不缓存、不依赖全盘快照，只转换请求范围。所有结果为独立只读数据，不改变 Rust 领域事实或生命周期；本机验证不等于跨平台或发布完成。

- D-260 调整 D-257 的绑定位置与 Cargo 包名，保留 Rust／TypeScript 分离：Rust 绑定位于 `bindings/node`（Cargo 包 `ziwei-node`，Rust 标识符 `ziwei_node`），TypeScript 按 D-262 迁至 `packages/ziwei/src`（npm 包按 D-261 改为 `@matharts/ziwei`，禁止发布）。`crates/` 承载引擎，`bindings/` 按宿主组织 Rust 适配层；两者由根 Cargo workspace 管理。根 pnpm workspace 继续管理 `packages/*` 与共享锁文件，JS 包通过 Rust manifest 构建内部原生产物。Wasm 等适配在实施时加入 `bindings/`，分发合同另行确定；不创建空包，不改变核心职责与公开合同。

- 保留 D-254 的对象模块职责：原生持有在 `bindings/node/src/natal.rs`，TS 包装在 `packages/ziwei/src/natal.ts`；入口分别为各自的 `lib.rs` 与 `index.ts`。D-256 已补齐查询，D-257 与 D-260 只迁移位置与包名，不改变原生生命周期、两个属性的缓存合同或核心职责。

### 核心职责

- 引擎仅支持唯一的项目排盘规则：不以流派分支，不设运行时规则版本。

- V1 包含本命盘、大限、流年、来因宫、生年四化、宫位四化与自化的原始关系；不提供解释或断语。连续飞化暂不属于 V1。

- 大限、流年不得在构建本命 `Natal` 时全量预计算；按需生成，核心暂不缓存。它们只重排宫职，不新增星曜、宫干四化、生年四化或其他本命事实。

- 历法换算、闰月、晚子时、时区和真太阳时不属于 V1 内核。

- 按 D-239（2026-09-08），V1 不提供计算追踪 API 或过程记录，追踪需求留到 V1 之后重新设计。Rust 核心以 `ZiweiError` 变体及载荷作为机器可匹配的错误合同；跨语言稳定错误码由未来 Node/Wasm 绑定阶段确定，不从中文 `Display` 或 Rust 内存布局推导。

- `ziwei` 包含领域身份、事实、排盘规则，以及 `Palace`、`Decade`、`Yearly` 的宫职名称与 `Star` 星曜名称；不定义 `Lang`、运行时翻译器、全局语言状态或通用本地化 API。`Stem`、`Branch` 的固定简体 `Display` 仅用于组合 `ZiweiError::Display` 中文诊断。

## 核心不变量

- 十二宫固定按寅、卯、辰、巳、午、未、申、酉、戌、亥、子、丑排列；十二宫名各出现一次。

- 十八个星曜身份各出现一次；每宫星曜输出按全局固定顺序排列。

- 每宫恰有四条宫位四化，顺序固定为禄、权、科、忌；全盘四种生年四化各出现一次，并落在对应目标星曜上。

- `ming_palace_branch` 必须解析到唯一的实际宫位；`shen_palace_name` 与 `shen_palace_branch` 必须解析到同一实际宫位；`origin_palace_name` 与 `origin_palace_branch` 必须由生年天干固定映射，并解析到同一实际宫位；该宫位的宫干等于生年干。

- `Birth` 按五行局与出生日安紫微：将日数补足为局数的倍数，从寅宫顺数至所得的商（寅算一），再按补数奇退偶进；补数为零时不移动。`Parameters` 直接采用给定的紫微地支。

- 十四主星由紫微地支统一排布：紫微、天机、太阳、武曲、天同、廉贞相对紫微分别逆行 `0、1、3、4、5、8` 宫；天府与紫微关于寅申轴对称，天府、太阴、贪狼、巨门、天相、天梁、七杀、破军相对天府分别顺行 `0、1、2、3、4、5、6、10` 宫。这两组仅用于安星，不改变南斗、中斗、北斗的星系归属。

- `Parameters` 的生年干和生年支必须组成有效六十甲子年柱。

- 由 `Birth` 构建的 `Profile::birth_year` 必须存在；由 `Parameters` 构建的则必须不存在。
