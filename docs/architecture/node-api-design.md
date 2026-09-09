# Node.js / TypeScript 适配层设计

状态：完整设计已确定，已确认的 Node API 已全部实现。2026-09-09，依据核心提交 `26d5cbeff3f88c64a5cbb4d6cec4a4fff861b428`。D-253、D-255、D-256 已完成两类建盘、全部读取／查询、按需限运、身份辅助、错误与 `toJSON`，见 [Node 包说明](../../packages/ziwei/README.md)。实际生成声明与本设计逐项匹配；这不是 npm 发布、全部平台或性能验证声明。

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
| bindings/node | 持有核心 Natal，验证宿主表示，调用核心，转换返回值和错误 | 重写规则、复制内部索引、导出裸指针 |
| packages/ziwei/src | TypeScript 公开导出、对象形状、深层只读、属性快照保存、异常外观 | 计算安星、四化或限运规则 |
| docs/architecture/node-api | 当前声明与编译型使用合同 | 可加载的 Node 包或绑定实现 |

不额外创建只有转发作用的 npm 层或第二套领域模型。宿主 DTO 是核心结果的投影，不具有独立排盘权威。后续 Wasm adapter 继续单向依赖核心，不依赖 Node 原生模块；其初始化和释放机制另属 Wasm 实施范围，不能据此声称浏览器已经可用。

### 返回值与内部传输

成功结果直接做有类型的对象转换，不经 JSON 文本序列化再解析。字符串和数组在宿主拥有自己的数据，核心借用仅限当前调用内使用。异常按核心变体携带结构化信息，不能只传一条 reason 字符串再在 JavaScript 中解析。

输出名称的 Rust DTO 字段借用核心已有的 `&'static str`，避免先分配临时 `String`；Node-API 转换后仍是独立的 JS 字符串，不将核心借用交给调用方。TS 继续按已知字段构建并深层冻结公开数据。仅在局部测量更快的就地冻结方案未保留，不能以减少对象数量代替端到端测量。

宫位与星曜的私有传输 DTO 使用 napi-rs 生成的定长元组；星曜将生年、向心、离心三项化象分别传输，缺失值显式为 `null`，不产生稀疏槽位。TS 在现有 `palace`／`star` 投影函数中解构元组，恢复具名的普通对象及嵌套 `selfTransformations` 后深层冻结。

元组顺序只属于同包内 Rust／TS 的实现约定，由生成类型、固定命例与公开结果一致性测试共同验证，不成为公开协议或新的领域模型。名称仍逐次来自核心，未增加全局名称表或缓存；其他 DTO 保持具名对象。该选择依据本机端到端对照，见 [包验证记录](#私有元组传输优化2026-09-09)。

### 目录与包名

按 D-260，Rust adapter 位于 `bindings/node`，Cargo 包名为 `ziwei-node`，Rust 标识符为 `ziwei_node`；TypeScript 门面按 D-262 迁至 `packages/ziwei/src`，npm 包名按 D-261 改为 `@matharts/ziwei`。根 Cargo workspace 同时管理引擎和 Rust 绑定，根 pnpm workspace 继续管理 `packages/*` 与共享锁文件；npm 包通过显式 Rust manifest 构建 `native/`，再由 TypeScript 构建 `dist/`。D-260 调整 D-257 的绑定位置与 Cargo 包名，D-261 只调整 npm 包名及对应导入路径；保留 Rust／TS 分离，不恢复 D-252 的同目录布局，也不改变宿主方法合同或创建第二套领域实现。

尚未核验 npm 名称可用性和 scope 权限，也未注册或发布。已确认的 Node API 已全部实现，设置 private/publish = false 防止误发布；Wasm 等宿主的 Rust adapter 在实施时加入 `bindings/`，分发包与加载合同另行确定，不预先创建空包。

保留 D-254 的模块职责：命盘对象实现分别为 `bindings/node/src/natal.rs` 和 `packages/ziwei/src/natal.ts`；各自的 `lib.rs`、`index.ts` 保留构造与导出职责。两个目录共同实现一个 Node adapter，内部包装函数不从包根导出，不改变以下接口、错误和生命周期合同。

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

Stem、Branch、PalaceName、StarName、Transformation 提供与核心同序的只读 ALL。Gender.yinYang、Stem.yinYang、Branch.yinYang、Branch.zodiac 对应核心现有方法。Stem/Branch 的数值本身就是子起/甲起 index，不增加同义 index 方法。

Rust 专用的 TryFrom、get、Clone、Hash、Debug、Display、AsRef 不机械变成 JavaScript 方法；它们的数据能力由输入校验、普通数值和快照属性承接。

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

适配层按已知 DTO 结构自底向上对每个记录和数组执行 Object.freeze，包括 stars、自化记录、年龄区间、聚合记录和嵌套数据；常量对象及 ALL 同样冻结。只处理自己创建的纯数据，不冻结调用方输入，也不递归遍历未知宿主对象。TypeScript readonly 是额外的静态提示，不替代运行时冻结。

[Object.freeze 的浅冻结与深冻结说明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze#deep_freezing)

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

- 一个 npm 包默认 ESM，`import` 与 Node 的 `require(ESM)` 共同加载单份 `dist/index.js`，共享命名导出、身份常量和 ZiweiError 类；无 CJS 双构建、无桥接文件、无 top-level await，不把原生内部类作为公开构造器。

- public exports 仅包根，不开放内部二进制与实现子路径。不在导入时联网下载，不设置自动从源码编译的安装回退；缺少匹配产物时给出可操作的加载错误。

- 首个切片采用 napi-rs v3、Node-API 8，补丁版本与工具版本已锁定，详见 [绑定依赖](../../bindings/node/Cargo.toml)和[工具链配置](../../mise.toml)。必须验证生成代码与实际加载，不通过升级 Node-API 等级宣称性能收益。

- 支持门槛调整为 Node >=24.15.0，开发固定 24.21.0；不再声明 Node 22 支持。平台目标仍为 macOS arm64、Linux x64 GNU、Windows x64 MSVC，未实测平台不得称为已验证。24.15.0 是本项目依赖的 `require(ESM)` 稳定版本，也涵盖 24.12.0 已稳定的 TS 类型擦除。[Node 官方模块文档](https://nodejs.org/docs/latest-v24.x/api/modules.html#loading-ecmascript-modules-using-require)

- 每个平台需要产物构建和干净环境的真实 import、创建、查询与失败路径测试；OS 最低版本、glibc 和 SDK 底线随构建产物验证后公布。未在矩阵内的平台、Bun、Deno、Electron 和浏览器不作首版支持声明。

- Node-API 的 ABI 稳定不等于操作系统、libc 或全部宿主运行时兼容。[napi-rs 兼容性说明](https://napi.rs/docs/more/support-compatibility)

- TypeScript 声明检查基线已按用户要求升级为 7.0.2，实际包与完整设计合同通过 NodeNext／Bundler 检查。D-256 另以最终包入口测试已实现查询、限运及 JSON，并在独立消费端验证打包后的声明；不能由此宣称其他宿主已得到验证。先前 5.9.3 的设计阶段核验记录保留如下。

- mise 管理 Rust、Node 24.21.0、pnpm 12.3.4 及 build:node/check:node。根 Cargo workspace 已加入绑定，default-members 仍为核心；CI 已接入首轮 Node 构建与测试。本地钩子不新增 Node 测试，Rust 工具链不变。

## 10. 验收与完成界限

### 设计阶段

- 两个创建入口、28 个 Natal 读取/查询方法、Palace::star 均有宿主映射。

- 所有公开领域值、字段、简繁名称、Optional/Result 和 Rust 专用表示均有明确处理方式。

- 声明与完整调用草图通过严格 TypeScript 检查；负例覆盖缺字段、身份混用、null、嵌套修改和错误载荷收窄。

- 同步相关架构、适配合同和决策指针；核心源码不变。

### 完整实施验收清单

D-253、D-255、D-256 已在 macOS arm64／Node 24 验证下列功能、错误、只读、生命周期与打包消费端场景，实际结果见 [包验收记录](#历史验收与优化记录)。全部平台验收与性能测量仍未完成，不能把本机 API 测试通过解释为整张清单已完成。

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

## 历史验收与优化记录

以下记录迁自包 README，保留当时的验收与优化事实，不代表当前源码、远端 CI 或跨平台支持状态。记录中的“本页”“上文”等表述指当时的包 README；性能数字仅适用于记录中的机器与测量协议。

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

- 独立 tarball 消费端：离线安装且禁止安装脚本，实际 import／require、查询、限运、JSON、原生错误身份与强制 GC；从安装后的包编译 `.ts`／`.cts` 消费代码。四个 Worker 分别创建、查询并传递纯数据，正常退出。

- Rust：`cargo test --workspace --all-features --locked` 及对应 release 测试通过，各含 101 项核心测试与 16 项 doctest；绑定行为由 Node 集成测试验收。

- `cargo fmt --all -- --check`、全目标全特性 Clippy（`-D warnings`）、Rust 1.98.0 的绑定全目标全特性 locked 检查通过。

- 本页 TypeScript 示例实际执行通过；文档链接、空白与 `git diff --check` 核验通过。

核心源码、工具链、依赖和锁文件未修改；更新了包简介。现有未提交成果保留，未提交、推送、发布或运行性能基准；其他平台及 Node 22／26 尚未验证。Worker／GC 是功能检查，不是无泄漏证明。版本相关转换核对了 napi-rs 的 [类型转换](https://napi.rs/docs/concepts/type-conversions)、[对象](https://napi.rs/docs/concepts/object) 与 [错误处理](https://napi.rs/docs/concepts/error-handling) 文档，并以锁定版本的实际编译／加载确认可用。

### 多包目录与包名迁移（2026-09-09，D-257）

当时按用户要求分离 Rust 与 TypeScript，将 npm 包改为合法 scoped 名称 `@ziweijs/core`。Cargo workspace 成员、根 pnpm workspace、共享锁文件、mise、CI、包自引用与消费端测试已同步；不保留旧包名兼容别名。保留薄适配职责，未引入新的领域模型、运行依赖或发布脚本。当前包名已按 D-261 改为 `@matharts/ziwei`，本节保留历史迁移记录。

本轮实际通过：

- 根目录 `pnpm install --offline --frozen-lockfile`，下载数为 0；锁文件仅迁移业务依赖的 importer，所有依赖解析结果和工具版本不变。

- `mise run check:node`：原生 release 构建、28 项 Node 测试及严格 NodeNext 类型合同；Bundler 类型检查另行通过。补充测试后重新通过 28 项测试，独立 tarball 只包含分发产物，包名与单一根导出正确，无 Rust／TS 源文件、workspace 工具或运行依赖；ESM／CJS 均实际加载。

- 迁移前后 Rust／TS 实现源码、ESM 入口和全部五个公开生成声明逐字节一致；核心与 xtask 源码未改动。

- Cargo workspace debug／release 全特性 locked 测试均通过，各含 101 项核心测试与 16 项 doctest；fmt、全目标全特性 Clippy（`-D warnings`）、Rust 1.98.0 绑定检查通过。

- README 与 Rust 架构文档的 Rust 示例、actionlint 1.7.12／ShellCheck 0.11.0、38 个文档相对链接与空白检查通过；除历史决策记录外，当前文件不再引用旧包名或旧目录。远端 CI 与其他平台未运行，不将本机验收等同于平台支持或可发布状态。

旧目录不再存在；其中旧的 `native/`、`dist/` 和 `node_modules/` 已转存至本机 `/tmp/ziwei-node-layout.jh9Ajw/node`，可在系统清理临时目录前取回，新目录已从锁文件重新安装并构建。未删除源码，未提交、推送或发布，npm scope 权限未核验。

### 绑定分层优化（2026-09-09）

保留两项内部改动：输出名称借用核心静态字符串，取消临时 Rust `String` 分配；输入捕获单遍选择最小未知字符串 key，不再构造并排序额外 key 数组。必填字段的捕获顺序、每个描述符读取一次、未知字符串 key 优先于 symbol、中文错误和深层只读合同均不变。输入字段数固定，未知 key 处理由排序改为线性扫描；正常输入仍执行全部校验。

在 Apple M4 Max／Node 24.20.0 上，固定 512 Birth + 512 Parameters、相同批大小、三组交错前后对照中，建盘并首次读取十二宫的批平均中位数由 23.98 µs 降至 23.18 µs；大限／流年查询分别由 3.90／3.95 µs 降至 3.56／3.59 µs。

纯建盘没有稳定提速，不能将本轮优化描述为消除了 Node 与 Rust 的性能差距。128～8,192 个未知 key 的独立异常输入测量下降约 40%～66%，不代表正常建盘收益。

另试验了原生显式输出 `null` 并在 TS 就地冻结：TS 局部更快，但额外原生转换抵消收益，未保留。该轮完成时 `natal.ts` 与优化前一致；后续传输调整见下一节。源码、各候选产物、原始样本和测量协议保存在本机 `target/benchmarks/node/layers-XiNNgm/`；属于未提交工作树的 provisional 记录，不是正式性能基线、单次调用 P95 或其他平台承诺。

验证：30 项 Node 测试、NodeNext／Bundler 类型检查、独立打包消费端与 Worker／GC 检查通过；两版各 1,024 盘、653,312 次公开读取／查询的逐盘摘要一致，输出均为深层冻结普通数据。全部五个生成的 `.d.ts` 逐字节一致。Cargo workspace debug／release 全特性测试、fmt、Clippy（`-D warnings`）与 Rust 1.98.0 绑定检查通过。核心、依赖、工具链及公开 API 均未修改；未提交、推送、发布或运行远端 CI。

### 私有元组传输优化（2026-09-09）

原生十二宫读取的采样中，约 48% 的主线程样本经过 `napi_define_properties`，约 17% 经过字符串创建；这是调用栈采样归因，不是各阶段精确耗时或可相加的成本分账。试验了仅宫位元组、仅星曜扁平元组，以及两者结合；最终保留组合方案，未继续引入其他表示。

`NativePalace` 与 `NativeStar` 使用 napi-rs 的输出专用定长元组，后者不再单独构造原生自化记录；三项独立化象都保留并显式传 `null`。TS 只在既有投影函数解构，还原原有具名对象、嵌套结构和深层冻结。公开 API、五份生成的 `.d.ts`、名称归属、按实例惰性保存和原生生命周期记账均不变；没有新缓存、依赖、手写 unsafe 或领域规则副本。

[napi-rs 元组与 nullable 转换说明](https://napi.rs/docs/concepts/napi-attributes#classes-and-value-shapes)

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

验证：32 项 Node 测试、严格 NodeNext／Bundler 类型检查、独立 tarball 消费端、Worker／GC、冻结失败重试通过；两版各 1,024 张盘、653,312 次公开操作的逐盘摘要一致。新增检查覆盖全部宫位投影的具名自有数据属性，以及数组原型存在数字属性时缺失化象仍为 `null`。

Rust workspace debug／release、fmt、Clippy（`-D warnings`）和 Rust 1.98.0 绑定编译检查通过。最低版本检查不替代该版本下的实际 Node 运行矩阵。

每版另运行三轮各 8,192 张盘的持有／读取／释放检查：持有完整宫位时 JS heap 约 76.5 MiB，释放后回到约 5.15 MiB，基线约 5.07 MiB；已取得的宫位在原生对象释放后仍可用。两版持有内存相近，不宣称减少持久内存或证明无泄漏；RSS 包含分配器保留及验证用 JSON 字符串成本。

源码快照、候选、原始样本、采样栈与重放脚本保存在本机 `target/benchmarks/node/transport-Fu9vyW/`。未修改核心与 xtask 源码，未提交、推送、发布或运行远端 CI；其他平台未验证。
