# TypeScript 公开 API

`@matharts/ziwei` 是纯 TypeScript、同步、单份 ESM 包。Node.js、浏览器页面和 module Worker 从同一包根导入。接口按 Rust crate 的公开领域能力重新设计，规则由 TypeScript 独立计算；旧 Node 门面的 `palaceStar`、`toJSON`、原生句柄、Wasm 初始化和释放接口均不属于当前 API。

领域行为以[领域合同](domain-contract.md)、[`CONTEXT.md`](../../CONTEXT.md)及其确认的决策为准。Rust 与 TypeScript 各自实现这些行为；Rust 的借用、`Result`、`Option`、`TryFrom` 不是 JavaScript 的运行时类型。

## 创建命盘

```ts
import { Ziwei, Gender, Branch, StarName } from "@matharts/ziwei";

const natal = Ziwei.fromBirth({
  gender: Gender.Male,
  birthYear: 1984,
  birthMonth: 1,
  birthDay: 6,
  birthHour: Branch.Zi,
});

const palace = natal.palaceByStar(StarName.ZiWei);
const star = palace.star(StarName.ZiWei); // Star | null
```

`Ziwei.fromParameters` 接收 `gender`、`birthStem`、`birthBranch`、`birthMonth`、`ziweiBranch`、`birthHour`。参数的干支必须阴阳相配，`ziweiBranch` 由调用方提供。`Birth` 保留数字年份和日期；`Parameters` 的档案中这两项为 `null`。月份、日期、年份和序号仍以普通 `number` 输入，在边界处运行时校验。输入对象仅接受列出的自有数据属性，不读取 getter 或原型继承值。调用方须先完成历法归一化；本包不接收 `Date`、闰月标记、时区或真太阳时。

## Rust 公开能力映射

Rust 的 `Ziwei::from_birth`／`from_parameters` 分别对应 `Ziwei.fromBirth`／`fromParameters`。`Natal::profile`、`zodiac`、`five_element_bureau`、`palaces` 在 TypeScript 中是只读属性。其余 `Natal` 领域查询均使用 camelCase 方法：

| 本命与关系 | 期间 |
| --- | --- |
| `palace`、`oppositePalace`、`sanfangPalaces`、`sizhengPalaces`、`palaceByName` | `periodIndicesAtAge`、`decade`、`decadeByBranch`、`decadePalaceByName`、`decadeYears` |
| `mingPalace`、`shenPalace`、`originPalace`、`ziweiPalace`、`palaceByStar`、`star` | `yearly`、`yearlyByBranch`、`yearlyPalaceByName` |
| `birthTransformations`、`selfTransformations`、`palaceTransformation`、`palaceTransformations`、`palaceTransformationSources` | |

Rust 的 `Palace::star` 对应 `palace.star(name)`，未命中时返回 `null`；`Natal::star` 始终返回唯一星曜。宫位、星曜、档案、期间结果和关系均为不可变结果。`Palace`、`Star`、`Natal` 在包根只作为类型导出，消费者不能直接构造命盘或领域结果。

Rust 的 `Stem::index`、`Branch::index` 与 `BirthMonth::get` 等简单值读取由 TypeScript 的数值本身表示；`Gender`、`Stem`、`Branch`、`PalaceName`、`StarName` 和 `Transformation` 使用冻结的常量对象。`genderYinYang`、`stemYinYang`、`branchYinYang`、`branchZodiac` 对应 Rust 身份转换。简繁名称是结果属性，不参与规则选择。

失败时抛出 `ZiweiError`，包含机器可区分的 `code` 和冻结的 `detail`；无结果时返回 `null` 或空数组。`Parameters` 没有数字年份时，大限年度摘要的 `year` 明确为 `null`。所有方法同步执行；首次读取宫位或星曜时物化并缓存冻结的宫位与星曜对象，重复读取返回同一对象。`palaceByStar` 直接读取预计算的星曜落宫位置；`star` 前 31 次查询直接读取预计算星曜值，第 32 次按需建立十八星引用数组，均不为此生成十二宫；`birthTransformations` 首次调用时仅定位四颗化星及其所在宫位，并缓存冻结的查询结果。单纯读取十二宫和反查四化来源不承担按星索引开销。星曜和空宫的星曜列表是不可变值，相同值可跨命盘共享对象；星曜位置应通过所属命盘的 `palaceByStar` 查询，不能由对象引用推断所属命盘。大限和流年的十二宫名称各有十二种共享的冻结排列；`periodIndicesAtAge` 按年龄偏移复用 120 个冻结值，具体命盘的期间宫位位置按请求计算。大限年度摘要首次请求时生成冻结结果，此后命盘内按大限序号复用；相同出生年与起始年龄的结果还通过最多 8192 项的模块私有缓存跨盘共享。宫干四化关系按请求计算，聚合结果在重复组合时可跨命盘复用。

实现采用函数式规则核心。出生输入映射为句柄私有的只读事实值，公开档案保持冻结；固定星曜资料和四化表集中在 `src/stars/catalog.ts`，本命与期间宫职名称集中在 `src/palaces/catalog.ts`。落宫规则独立于星曜值缓存，宫位由物化函数构造为冻结的领域值，星曜值由模块私有的有界缓存预先创建并复用。单宫查询只生成目标宫位；首次读取 `palaces` 时由同一物化函数补齐十二宫，并保留已生成宫位的对象身份。

模块初始化逐组合复用 18 项落宫工作区，根据紫微宫位、月份和时辰生成各宫星曜位掩码及逐星目标宫位表。目标宫位以寅起十二宫序号存储；需要公开地支时才转换。仅建盘时不分配十八星的落宫数组，首次读取宫位时按位掩码中的星序生成并冻结宫内星曜数组。单星数组按星曜缓存下标跨组合复用；多星数组按年干、宫位和位掩码复用。同一年干、紫微宫位、月份、时辰的组合第二次出现后，还会复用其十二宫星曜数组表；组合缓存最多容纳 17,280 种。

年干、落宫与星曜对应的四化缓存下标由模块私有定长表预计算，四化星曜的数值下标也预计算，供生年及宫干四化查询复用。四化关系由独立函数投影；宫干四化单项和聚合查询读取逐星目标宫位表，来源反查读取目标宫的位掩码并从年干取得源宫宫干。宫干四化聚合查询按源宫、源宫干与星曜布局复用冻结结果：同一组合第二次出现后缓存，最多保留 8192 组，因此重复调用可能返回相同数组及关系对象。单项查询与来源反查仍生成新的冻结结果，且不物化十二宫。自化查询第二次调用时在句柄中保留扁平的宫位、星曜引用序列，后续调用从该序列生成新的冻结结果。`Natal` 的内部句柄负责公开方法、延迟物化与查询索引缓存；宫干四化聚合结果的引用身份不承诺每次新建。

两种建盘入口分别构造类型完整的 `Profile`，本命事实在建盘时只计算一次星曜布局序号。宫干与五行局规则位于 `src/domain/sexagenary.ts`，供建盘与星曜查询共同使用；星曜和宫位规则不依赖命盘句柄。本命事实将年干与布局序号传入查询函数，避免各模块重复组合紫微宫位、月份和时辰。身份常量及索引位于 `src/domain/identities.ts`；`identity-queries.ts`、`inputs.ts`、`validation.ts` 与 `constraints.ts` 分别负责身份转换、建盘输入、查询参数和基础约束，领域常量不依赖异常或校验逻辑。

星曜值缓存下标表与自化活跃位掩码在同一轮初始化中由四化规则生成；建表用的四化映射不保留为运行时状态。四化星名到星曜序号的派生索引由 `src/stars/catalog.ts` 提供，值缓存与四化查询共用。生肖地支对照由身份模块提供，建盘和公开身份转换共用。

`selfTransformations` 根据年干、落宫与星曜的预计算位掩码，只物化含自化星曜的宫位；之后读取 `palaces` 会补齐其余宫位，并保留已返回宫位的对象身份。每次自化查询仍返回新冻结数组及新关系对象。

`sanfangPalaces` 和 `sizhengPalaces` 首次只物化返回的三或四宫；已物化十二宫时直接读取缓存数组。若随后读取 `palaces`，会补齐其余宫位并保留先前返回的对象身份。

首次单宫查询仅生成目标宫的冻结星曜数组；同一组合再次查询或读取十二宫时，才补齐该组合的分组表并参与跨盘缓存。来源反查首次查询时把冻结结果作为模块私有模板缓存，按年干与目标宫星曜位掩码索引，最多保留 4096 项。命中时仍重新构造并冻结返回数组及每条关系；完整有效排盘组合共有 3410 种这类键，缓存上限覆盖全部组合。

## 验证边界

共享 [conformance 用例](../../conformance/README.md)提供独立推导的部分领域预期；包测试另覆盖公开查询、输入值域、只读结果、打包消费和真实浏览器。两种实现的输出相同只证明一致性，不能替代独立预期。完整 V1 覆盖仍以[实现状态表](implementations.md)登记的缺口为准。
