# Node.js / TypeScript 适配层设计

状态：完整设计已确定，已确认的 Node API 已全部实现。2026-09-09，依据核心提交 `26d5cbeff3f88c64a5cbb4d6cec4a4fff861b428`。D-253、D-255、D-256 已完成两类建盘、全部读取／查询、按需限运、身份辅助、错误与 `toJSON`，见 [Node 包说明](../../packages/core/README.md)。实际生成声明与本设计逐项匹配；这不是 npm 发布、全部平台或性能验证声明。

## 结论与交付物

采用持有 Rust 核心的 `Natal` 门面，加普通深层只读数据快照。事实读取用属性，定位、聚合与限运用方法；保留核心全部查询能力。单项查询不依赖全盘快照，只有 `profile`、`palaces` 这两个不可变对象属性按实例惰性保存。

- [完整 TypeScript 声明](node-api/index.d.ts)：导出、输入、字段、查询与错误的唯一类型清单。
- [完整调用用例](node-api/examples.ts)：两类输入、十二宫、宫内与全盘查星、四化、大限、流年和错误处理。
- [类型合同测试](node-api/contract.test.ts) 与 [检查配置](node-api/tsconfig.json)：仅编译，不运行绑定。
- [核心适配语义合同](adapter-contract.md)：值域、顺序、事实与规则的上位约束。

这里的选择优先满足易用、事实一致和实现有界，不声称理论或实测上的全局最优。今后优化内部转换方式不得破坏已承诺的可观察行为。

## 1. 模块与交付范围

| 模块 | 职责 | 不承担的工作 |
| --- | --- | --- |
| crates/ziwei | 唯一排盘规则与领域事实源 | Node 对象、JSON、语言配置 |
| crates/ziwei_napi | 持有核心 Natal，验证宿主表示，调用核心，转换返回值和错误 | 重写规则、复制内部索引、导出裸指针 |
| packages/core/src | TypeScript 公开导出、对象形状、深层只读、属性快照保存、异常外观 | 计算安星、四化或限运规则 |
| docs/architecture/node-api | 当前声明与编译型使用合同 | 可加载的 Node 包或绑定实现 |

不额外创建只有转发作用的 npm 层或第二套领域模型。宿主 DTO 是核心结果的投影，不具有独立排盘权威。后续 Wasm adapter 继续单向依赖核心，不依赖 Node 原生模块；其初始化和释放机制另属 Wasm 实施范围，不能据此声称浏览器已经可用。

成功结果直接做有类型的对象转换，不经 JSON 文本序列化再解析。字符串和数组在宿主拥有自己的数据，核心借用仅限当前调用内使用。异常按核心变体携带结构化信息，不能只传一条 reason 字符串再在 JavaScript 中解析。

输出名称的 Rust DTO 字段借用核心已有的 `&'static str`，避免先分配临时 `String`；Node-API 转换后仍是独立的 JS 字符串，不将核心借用交给调用方。TS 继续按已知字段构建并深层冻结公开数据。仅在局部测量更快的就地冻结方案未保留，不能以减少对象数量代替端到端测量。

宫位与星曜的私有传输 DTO 使用 napi-rs 生成的定长元组；星曜将生年、向心、离心三项化象分别传输，缺失值显式为 `null`，不产生稀疏槽位。TS 在现有 `palace`／`star` 投影函数中解构元组，恢复具名的普通对象及嵌套 `selfTransformations` 后深层冻结。元组顺序只属于同包内 Rust／TS 的实现约定，由生成类型、固定命例与公开结果一致性测试共同验证，不成为公开协议或新的领域模型。名称仍逐次来自核心，未增加全局名称表或缓存；其他 DTO 保持具名对象。该选择依据本机端到端对照，见 [包验证记录](../../packages/core/README.md#私有元组传输优化2026-09-09)。

按 D-257，Rust adapter 位于 `crates/ziwei_napi`，Cargo 包名仍为 `ziwei-napi`；TypeScript 门面位于 `packages/core/src`，npm 包名为 `@ziweijs/core`。根目录的 pnpm workspace 管理 `packages/*` 与共享锁文件；npm 包通过显式 Rust manifest 构建 `native/`，再由 TypeScript 构建 `dist/`。这取代 D-252 的同目录布局，不改变宿主合同或创建第二套领域实现。

尚未核验 npm 名称可用性和 scope 权限，也未注册或发布。已确认的 Node API 已全部实现，设置 private/publish = false 防止误发布；Wasm 尚未进入实施，其目录与分发包在实施时确定，不预先创建空包。

保留 D-254 的模块职责：命盘对象实现分别为 `crates/ziwei_napi/src/natal.rs` 和 `packages/core/src/natal.ts`；各自的 `lib.rs`、`index.ts` 保留构造与导出职责。两个目录共同实现一个 Node adapter，内部包装函数不从包根导出，不改变以下接口、错误和生命周期合同。

## 2. 顶层导出与调用风格

- 仅命名导出，不提供默认导出。
- `Ziwei` 是冻结的入口对象，仅含 `fromBirth`、`fromParameters`；不支持 `new Ziwei()`。
- `Natal` 只作为 TypeScript 类型导出，没有公开构造器、原生句柄、克隆或反序列化建盘入口。
- `ZiweiError` 是公开 JavaScript Error 子类，用于 `instanceof`；构造器不作为公开使用入口。
- Rust snake_case 映射为 camelCase；领域类型保留名称，不恢复旧别名。
- 两个创建函数及所有查询同步完成。单次操作范围固定；不为每张盘默认引入 Promise、线程池或 async 初始化。大量循环会阻塞调用线程，批量任务由调用方使用 Worker；V1 不增加批量、任务队列或取消接口。
- Natal 的方法需要原实例作为接收者，不承诺裸提取后仍可调用；入口对象上的两个创建函数不依赖调用方 this。

## 3. 输入与表示

`Birth` 使用 gender、birthYear、birthMonth、birthDay、birthHour。`Parameters` 使用 gender、birthStem、birthBranch、birthMonth、ziweiBranch、birthHour，不接受数字年份或出生日。字段全集及 readonly 声明见类型清单。

输入是已有出生事实，不接受 Date 或时间戳替代所列字段，不接收时区、闰月标志或语言选项，也不执行历法换算。输入只在调用时读取，之后修改原对象不会改变命盘；不保存输入对象引用或来源标记。

| 领域值 | 宿主表示 | 约束 |
| --- | --- | --- |
| Gender | 0 = Female，1 = Male | 延续 D-068、D-104 |
| YinYang | 0 = Yin，1 = Yang | 与 Gender 是不同领域概念 |
| Stem | 甲至癸的 0..9 | 显式映射核心 index，不读取 enum 布局 |
| Branch | 子至亥的 0..11 | 时辰同样使用此值；不是 0..23 小时 |
| FiveElementBureau | 2、3、4、5、6 | 水二、木三、金四、土五、火六 |
| PalaceName、StarName | 核心变体拼音字符串，如 Ming、ZiWei | 不是中文显示名或私有索引 |
| Transformation | A、B、C、D 字符串 | 分别为禄、权、科、忌 |
| FiveElement、Zodiac、StarCategory、StarGalaxy | 声明中逐项列出的英文身份字符串 | 固定协议身份，不取自 Debug |
| BirthMonth / BirthDay | number | 必须为整数 1..12 / 1..30 |
| DecadeIndex / YearlyIndex | number | 必须为整数 0..11 / 0..9 |
| birthYear | number | 必须在 i32 全范围内，含零和负数 |

所有身份使用冻结的常量对象，既可写 `Branch.You`，也可直接提供合法协议值。不使用 TypeScript enum，不要求调用方构建 Rust 式包装对象或 branded number。四个范围数值别名仍是 number，不声称编译器可以验证动态值的范围；运行时校验不可省略。

这是结构类型的明确取舍：数值重叠的 Stem、Branch、Gender 等不能在所有场景下被 TypeScript 区分，DecadeIndex 与 YearlyIndex 也不是名义类型。本方案优先接受普通数字与表单状态，不声称无需运行时校验即可防止所有身份混用。

Stem、Branch、PalaceName、StarName、Transformation 提供与核心同序的只读 ALL。Gender.yinYang、Stem.yinYang、Branch.yinYang、Branch.zodiac 对应核心现有方法。Stem/Branch 的数值本身就是子起/甲起 index，不增加同义 index 方法。Rust 专用的 TryFrom、get、Clone、Hash、Debug、Display、AsRef 不机械变成 JavaScript 方法；它们的数据能力由输入校验、普通数值和快照属性承接。

### 输入验证顺序

1. 根输入必须为非 null、非数组的对象；只读取自身属性，不使用继承属性补齐字段。
2. 按声明顺序检查必需字段是否存在、是否为数据属性；拒绝 accessor。再拒绝额外自身键，包括 symbol 键。输入不是可扩展 options bag，避免拼错字段被忽略。
3. 按声明顺序验证值；查询参数按从左到右验证。缺少参数为 missing；显式 undefined 为 type。数值依次检查 number、有限、整数、宿主表示范围；不使用 parseInt、位运算、截断或隐式 coercion。
4. 生年月日和限运索引先通过 0..255 的宿主整数检查，再调用核心 TryFrom；合法枚举先显式映射为核心值。Parameters 最后由核心 new 校验干支阴阳匹配。

Native seam 同样必须拒绝非法数值，不能假设调用方必然经过 TypeScript 门面。推荐先接收 f64 并验证，再转整数；不能让自动 u8 转换先截断。月份范围、干支配对等领域判定仍交给核心，不在两层各维护一份规则。

门面先捕获自身数据属性的值，再传给 native，避免读取同一字段多次。函数额外的位置实参按 JavaScript 惯例忽略，不被当作隐藏 options；这不同于输入记录中拒绝未知字段的合同。

-0 按 0 处理。大于宿主允许范围的数值不先强转。代理对象可能在属性描述符检查时执行 trap；本包不是 JavaScript 沙箱，不保证抑制用户代码的副作用，trap 抛出的异常原样传播，不伪装为领域错误。

## 4. 数据对象与本地化

Profile 保留七个出生事实。birthYear 与 birthDay 必须同时有值或同时为 null；类型使用联合表达这个约束，不新增来源字段。所有可缺失输出显式为 null，不使用 undefined、0 或空字符串。

Palace、Star、SelfTransformations、Decade、Yearly、DecadeYear、PalaceTransformation 的全部字段见声明。它们是无查询方法、无原生句柄的普通记录；数组也是普通 JavaScript Array。

- 宫位、星曜、限运宫职直接带 nameHans、nameHant；星曜另带 abbrHans、abbrHant。字符串从核心现有方法获取。
- name 保存稳定身份，nameHans/nameHant 仅显示；不以名称选择规则，不引入 Lang、默认语言或全局语言状态。
- Decade、Yearly 各自保留 name 和对应的大限/流年名称，不增加 index、branch 等核心没有的事实。数组位置与本命宫位对齐。
- decadeAgeRange 使用包含两端的 `[start, end]` 虚岁元组；end = start + 9。
- DecadeYear.year 是 number 或 null。当前合法最大值 2147483771，超过 i32 但仍为安全整数；转换时先验证可精确表示，不通过 i32 或 Date。
- LocatedStar 用 `{ palace, star }` 承接核心二元借用。PeriodIndices 用 `{ decade, yearly }` 承接核心序号二元组；两者只是具名返回记录，不是新增排盘领域。

## 5. 全部查询映射

下表覆盖当前 Natal 的全部 28 个公开读取/查询方法，并显式保留 Palace::star。除属性外，宿主名均为方法。

| Rust 入口 | Node / TypeScript | 结果合同 |
| --- | --- | --- |
| Natal::profile | profile 属性 | Profile |
| Natal::zodiac | zodiac 属性 | Zodiac |
| Natal::five_element_bureau | fiveElementBureau 属性 | 五行局数值 |
| Natal::palaces | palaces 属性 | 十二宫只读数组 |
| Natal::palace | palace(branch) | 唯一本命宫位 |
| Natal::opposite_palace | oppositePalace(branch) | 对宫 |
| Natal::sanfang_palaces | sanfangPalaces(branch, includeSelf) | false 为偏移 4、8、6；true 为 0、4、8、6 |
| Natal::sizheng_palaces | sizhengPalaces(branch) | 与上项 true 同序的四项 |
| Natal::palace_by_name | palaceByName(name) | 按本命宫职定位 |
| Natal::ming_palace | mingPalace() | 命宫 |
| Natal::shen_palace | shenPalace() | 身宫 |
| Natal::origin_palace | originPalace() | 来因宫 |
| Natal::ziwei_palace | ziweiPalace() | 紫微星所在宫位 |
| Natal::palace_by_star | palaceByStar(name) | 星曜所在宫位 |
| Natal::star | star(name) | 唯一星曜，不为 null |
| Palace::star | palaceStar(branch, name) | 等价于核心 palace(branch).star(name)；未命中为 null |
| Natal::birth_transformations | birthTransformations() | 四项 LocatedStar，A/B/C/D 顺序 |
| Natal::self_transformations | selfTransformations() | 寅至丑、宫内星序；同星双向只返回一次 |
| Natal::palace_transformation | palaceTransformation(sourceBranch, kind) | 一条关系 |
| Natal::palace_transformations | palaceTransformations(sourceBranch) | 四条关系，A/B/C/D |
| Natal::palace_transformation_sources | palaceTransformationSources(targetBranch) | 源宫寅至丑、各源宫 A/B/C/D；可为空 |
| Natal::period_indices_at_age | periodIndicesAtAge(age) | PeriodIndices 或 null |
| Natal::decade | decade(index) | 十二大限宫职 |
| Natal::decade_by_branch | decadeByBranch(decade, branch) | 指定实际宫位的大限宫职 |
| Natal::decade_palace_by_name | decadePalaceByName(decade, name) | 本命实际宫位，其 name 仍为本命宫职 |
| Natal::decade_years | decadeYears(decade) | 时间递增十项；不含流年宫职 |
| Natal::yearly | yearly(decade, index) | 十二流年宫职 |
| Natal::yearly_by_branch | yearlyByBranch(decade, yearly, branch) | 指定实际宫位的流年宫职 |
| Natal::yearly_palace_by_name | yearlyPalaceByName(decade, yearly, name) | 本命实际宫位，不覆盖本命宫职 |

查询在 Rust 执行，adapter 只物化本次结果。迭代器在返回前完整消费为只读数组，不把 Rust 借用或惰性迭代器跨生命周期带到 JavaScript。单项查询不先生成批量结果；palaceStar 不要求调用方从 palaces 自行 find，也不强制先访问 palaces。

输出顺序不由适配层重排：palaces、decade、yearly 均为寅至丑；Branch.ALL 仍为子至亥。宫内星序沿用 StarName.ALL 的子序列。关系允许源目标同宫，允许同一来源的不同化象分别存在；不构造连续飞化。生年、自化与宫干四化不能混为同一属性。

所有结果数组使用只读数组声明，固定长度由运行时合同和测试保证，不铺开十二项泛型元组。数组下标访问在 noUncheckedIndexedAccess 下可能为 undefined；按地支、宫职或星曜查找时直接使用对应查询。

age 必须为整数 0..255；设五行局数为 b，只有 b..b+119 返回期间序号，合法但未覆盖的年龄返回 null，不循环、不钳制。非法宿主年龄与合法的未覆盖年龄明确区分。

## 6. 所有权、只读与快照复用

### 采用的实现基线

- `profile` 和 `palaces` 分别在首次成功访问时转换、深层冻结并保存。相同 Natal 重复读取同一属性保证返回同一对象。两个属性独立，不互相触发。
- 这是按实例、有界的展示快照保存，不是全局缓存或 Rust 查询缓存；不加入通用 Map、LRU、缓存选项或失效 API。
- 其他查询不缓存，返回只读结果；只转换请求范围，避免单次查星就付出完整命盘转换成本。
- zodiac、fiveElementBureau 为原始身份值。按需大限、流年、四化查询仍调用核心，不预计算或缓存所有期间。

选择这个基线的原因是兼顾完整展示与少量查询，不是已有性能胜出证据。创建时全量转换会让仅做查询的调用方付出额外成本；每次属性读取都重建数据又不利于反复展示。此处允许两个小而固定的属性保存，不进一步引入全对象身份池。

### 对象身份合同

仅 profile、palaces 两个属性保证按实例复用。不同 Natal 不共享这些对象；任何查询结果与属性快照、不同查询调用之间都不保证 `===`。同一命盘中宫位按 branch、星曜按 name 对齐；这些不是跨命盘全局 ID。

LocatedStar 的 star 与其 palace.stars 中同名星必须事实一致；是否同一 JavaScript 引用不属于合同。期间定位结果仍是本命 Palace，不能因为查询发生在大限或流年而更改 name 或星曜。

快照不反向持有 Natal 或原生句柄。只保存子数据不要求原生命盘继续存活。被 Natal 保存的快照随其引用存活；调用方另行持有的快照独立存活。没有主动 dispose、refresh、FinalizationRegistry 可观察回调或确定性 GC 时刻承诺。

原生资源由对应 JavaScript 环境管理，不能把该环境的句柄交给其他线程或 Worker；环境退出及 GC 清理不能重复释放。当前按原生 holder 大小记账，不重复计入 JS 快照。本机已验证 Worker 退出、独立消费端强制 GC 后子数据仍可读取，以及属性冻结失败后的独立重试；这些是功能冒烟，不构成确定性回收、无泄漏、内存峰值或其他平台的保证。

### 运行时只读

适配层按已知 DTO 结构自底向上对每个记录和数组执行 Object.freeze，包括 stars、自化记录、年龄区间、聚合记录和嵌套数据；常量对象及 ALL 同样冻结。只处理自己创建的纯数据，不冻结调用方输入，也不递归遍历未知宿主对象。TypeScript readonly 是额外的静态提示，不替代运行时冻结。[Object.freeze 的浅冻结与深冻结说明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze#deep_freezing)

Natal 外壳同样冻结，公开事实属性不提供 setter，也不能由调用方重定义；惰性状态保存在不可公开访问的内部存储。冻结外壳不等于停止内部惰性保存。输出没有需要修改的 Date、Map、Set、TypedArray 或自定义访问器。

成功冻结后才发布或保存快照。转换或冻结失败不得保存半成品，下次访问可以重试；不把内存耗尽承诺为可恢复的领域错误。严格模式下非法赋值可能抛 TypeError，非严格模式下可能被忽略；合同保证事实不变，不统一包装这种调用方修改错误。

## 7. JSON、Worker 与可移植性

只新增一个导出出口 `natal.toJSON()`，同时支持 JSON.stringify(natal)，不再增加同义 snapshot 方法。返回 NatalSnapshot：profile、zodiac、fiveElementBureau、palaces，加 mingPalaceBranch、shenPalaceBranch、originPalaceBranch、ziweiBranch。

四个定位地支通过核心现有公共宫位查询取得，不输出私有索引，不复制宫名字段。toJSON 可复用已冻结的 profile/palaces，外层记录也冻结；不承诺外层对象复用。结果不含限运预计算、方法、输入来源、原始输入、句柄、调试字段、规则版本或语言配置。

JSON 数据是输出，不是恢复核心对象的输入；不提供 fromJSON。重新创建有行为的命盘仍需 Birth 或 Parameters。JSON 属性顺序、空白和字节级 canonical form 不作保证；新增公开字段遵循包版本的兼容性规则，不把规则版本混入数据。

普通快照可以作为 Worker 消息的数据来源，但结构化克隆或 JSON 往返不会保留冻结状态。接收者拿到的是自己的数据副本，不自动获得 Natal 查询能力。原生 Natal 不支持跨 Worker 传递；需要计算时在目标 Worker 内由输入重新创建。未来对这些行为必须进行真实运行时验证。

## 8. 错误合同

预期的输入和领域错误抛出 ZiweiError，具有中文 message、name = ZiweiError、只读 code 和深层只读 detail。code 始终等于 detail.code；按 detail.code 分支可获得对应载荷的类型收窄。错误消息用于诊断，不用于机器判断。

| code | detail 载荷 |
| --- | --- |
| INVALID_ARGUMENT | path、reason、received |
| INVALID_SEXAGENARY_YEAR | stem、branch |
| INVALID_LUNISOLAR_MONTH | value |
| INVALID_LUNISOLAR_DAY | value |
| INVALID_DECADE_INDEX | value |
| INVALID_YEARLY_INDEX | value |

后五类逐项映射 Rust ZiweiError 变体，不解析中文 Display，不读取 enum 布局。message 保持中文；核心领域消息可沿用核心诊断，宿主表示错误补充明确字段路径。path 是只读字符串数组：空数组表示根，单元素数组表示对应字段或查询参数名，如 birthMonth、branch、kind、age、decade、index、yearly。任意未知字符串键作为一个完整路径元素保存，不解析其中的点号或括号。

INVALID_ARGUMENT 的 reason 为 missing、type、non_finite、non_integer、out_of_range、not_member、unknown_field 或 accessor。received 对数字保留调用时得到的 number 原值，包括 NaN、Infinity；其他类型只保存类别，不保留用户对象、函数、长字符串或秘密内容。未知字段使用其字段路径；symbol 键统一使用空路径，不调用用户提供的字符串转换。

因 accessor 或额外键而尚未读取字段值时，received.type 使用 unread，不为描述错误而触发 getter 或读取无关字段内容。多个额外键按字符串键的 UTF-16 字典序报告首项，字符串键之后再检查 symbol 键，使校验顺序确定。

例如 birthMonth = 31 通过 u8 表示检查后由核心报 INVALID_LUNISOLAR_MONTH；-1 或 256 先报 INVALID_ARGUMENT/out_of_range；1.5 报 non_integer；字符串报 type。无效干支是领域错误；宫内没有该星、合法年龄未覆盖是 null，不是异常。

错误本身不是 JSON 快照协议，JSON 对 NaN/Infinity 的转换不能被误认为保存了原始错误值。正常数据快照只包含可精确序列化的有限数值。原生加载、内部缺陷、输入 Proxy trap 或非法 this 接收者的异常不伪装为上述领域错误；不得把所有异常吞成 null。V1 不定义计算追踪输出。

## 9. 包装与兼容性目标

- 一个 npm 包提供 ESM 与 CJS 命名导出。内部共享同一个运行时实现，ESM 入口仅桥接，确保混合 import/require 使用同一 ZiweiError 类；不把原生内部类作为公开构造器。
- public exports 仅包根，不开放内部二进制与实现子路径。不在导入时联网下载，不设置自动从源码编译的安装回退；缺少匹配产物时给出可操作的加载错误。
- 首个切片采用 napi-rs v3、Node-API 8，补丁版本与工具版本已锁定，详见 [Node 包说明](../../packages/core/README.md)。必须验证生成代码与实际加载，不通过升级 Node-API 等级宣称性能收益。
- 初始正式验收目标为 Node 22/24 的 LTS 分支：macOS arm64、Linux x64 GNU、Windows x64 MSVC；Node 26 作为当前版本兼容性检查。2026-09-08 查到的 Node 官方列表为 22/24 LTS、26 Current。[Node 官方发布列表](https://nodejs.org/en/about/previous-releases)
- 每个平台需要产物构建和干净环境的真实 import、创建、查询与失败路径测试；OS 最低版本、glibc 和 SDK 底线随构建产物验证后公布。未在矩阵内的平台、Bun、Deno、Electron 和浏览器不作首版支持声明。
- Node-API 的 ABI 稳定不等于操作系统、libc 或全部宿主运行时兼容。[napi-rs 兼容性说明](https://napi.rs/docs/more/support-compatibility)
- TypeScript 声明检查基线已按用户要求升级为 7.0.2，实际包与完整设计合同通过 NodeNext／Bundler 检查。D-256 另以最终包入口测试已实现查询、限运及 JSON，并在独立消费端验证打包后的声明；不能由此宣称其他宿主已得到验证。先前 5.9.3 的设计阶段核验记录保留如下。
- mise 管理 Rust、Node 24.20.0、pnpm 12.3.4 及 build:node/check:node。根 Cargo workspace 已加入绑定，default-members 仍为核心；CI 已接入首轮 Node 构建与测试。本地钩子不新增 Node 测试，Rust 工具链不变。

## 10. 验收与完成界限

### 设计阶段

- 两个创建入口、28 个 Natal 读取/查询方法、Palace::star 均有宿主映射。
- 所有公开领域值、字段、简繁名称、Optional/Result 和 Rust 专用表示均有明确处理方式。
- 声明与完整调用草图通过严格 TypeScript 检查；负例覆盖缺字段、身份混用、null、嵌套修改和错误载荷收窄。
- 同步相关架构、适配合同和决策指针；核心源码不变。

### 完整实施验收清单

D-253、D-255、D-256 已在 macOS arm64／Node 24 验证下列功能、错误、只读、生命周期与打包消费端场景，实际结果见 [包验收记录](../../packages/core/README.md)。全部平台验收与性能测量仍未完成，不能把本机 API 测试通过解释为整张清单已完成。

1. 两类输入与核心事实逐字段对照；复用项目独立命例，不只做两入口互相对照。
2. 非法类型、缺字段、多字段、accessor、NaN、Infinity、小数、负数、-0、边界值、u8 截断反例、干支配对及全部错误载荷。
3. 全部查询、空宫与多星、宫内查星未命中、生年/双向自化、同宫四化、多来源关系、三方四正顺序。
4. 0/11 大限、0/9 流年、年龄覆盖两端与越界、负年/零年、超过 i32 的输出年份，以及两种 Profile 缺失状态。
5. 深层冻结、输入后改不影响结果、属性重复引用、单项查询不物化全盘、子结果独立生命周期、Worker 数据传递、跨 ESM/CJS 异常身份。
6. 从最终包入口验证所有宣称平台；Cargo 测试和声明检查不能替代 Node 测试。[napi-rs 测试指南](https://napi.rs/docs/more/testing-debugging)
7. 单独测建盘、首次完整读取、热读取、单项查询、完整业务流程及多盘持有内存；包含字符串转换、冻结和回收成本。使用相同结果合同和测量环境，不拿 Rust 纳秒基准当作 Node 端到端结论。

API 实现完成不代表 npm 发布、全平台验收或性能优化完成。后续若测量否定内部缓存时机，可在保留公开属性身份与只读合同的前提下优化；需要改变公开合同则必须明确修订，不能以性能名义静默改变。

## 设计过程记录

最初三个方向由用户逐项确认。缓存最初只是待选方案；在用户授权自主完成设计后，结合查询覆盖与单项物化约束，选择两个对象属性惰性保存、其他查询不缓存。没有采用所有对象都原生化、全局缓存、全盘身份池、默认全量限运、语言全局状态或复制规则。

`codebase-design` 用于保持完整调用体验与模块职责，`napi-rs` 用于宿主转换和生命周期约束，`typescript-advanced-types` 用于缺失值/错误的联合类型和类型负例，`dsa-design` 用于限制缓存范围。未创建绑定包、提交、推送或发布。

## 设计阶段核验记录（2026-09-09，TypeScript 5.9.3）

在 mise 环境的 Node v24.20.0 下，使用 TypeScript 5.9.3 执行：

```sh
rtk proxy mise exec -- npm exec --yes --package=typescript@5.9.3 -- tsc --project docs/architecture/node-api/tsconfig.json
rtk proxy mise exec -- npm exec --yes --package=typescript@5.9.3 -- tsc --project docs/architecture/node-api/tsconfig.json --module NodeNext --moduleResolution NodeNext
```

两种模块解析模式均退出 0；启用 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes，未跳过声明检查。22 个带 ts-expect-error 的负例及正向调用、缺失值/错误收窄、导出成员类型断言均通过。编译器通过 npm exec 的工具缓存取得，不创建项目 package.json 或修改依赖锁文件。

另外以当前源码做只读名称/字段映射核对：28 个 Natal 公开成员全部出现于声明和映射表，额外成员仅为显式设计的 palaceStar 与 toJSON；八类数据对象的 37 个公开 getter 均有字段投影；12 类枚举的 88 个身份均有明确常量值。该核对是当前源码的轻量文本检查，不替代未来 Rust/Node 差分测试。

新增文件及受影响文档的空白、末尾换行和本地文件链接检查通过；D-248～D-251 各出现一次。git diff --check 通过。Rust 核心、工具、Cargo、mise、CI 与钩子没有改动，本轮不重跑未受影响的 Rust 构建或性能基准；没有 Node 运行时、平台导入或远端 CI 的完成声明。
