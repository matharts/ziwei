# 下一批查询 API 候选

状态：2026-09-08，`palace_transformation` 已经用户确认并实现（D-247）；其余候选仅供选择，尚未确认或实现。保留 `sanfang_palaces` 和 `sizheng_palaces` 的名称及合同。

单项宫干四化已完成；剩余候选建议优先考虑两宫之间的四化、宫内星曜分类筛选。它们服务明确的查询动作，复用现有事实与规则。其余方法主要减少调用方的组合代码，按实际使用需要补充。

## 候选清单

表内 `kind` 的类型为 `Transformation`，地支参数为 `Branch`。除标为已实现的一项外，命名及返回合同均为提案。

| 优先级 | 建议方法 | 具体用途 | 建议返回 |
| --- | --- | --- | --- |
| 优先 | `Natal::palace_transformations_between(source, target)` | 查“命宫发出的哪些四化落入财帛宫” | `impl Iterator<Item = PalaceTransformation> + '_` |
| 已实现 | `Natal::palace_transformation(source_branch, kind)` | 只查“命宫化忌到哪里” | `PalaceTransformation` |
| 优先 | `Palace::stars_by_category(category)` | 只取某宫主星，或其他指定类别的星曜 | `impl Iterator<Item = &Star> + '_` |
| 按需 | `Natal::birth_transformation(kind)` | 直接取得生年化禄、权、科或忌对应的星曜及落宫 | `(&Palace, &Star)` |
| 按需 | `Natal::adjacent_palaces(branch)` | 取得某宫两侧的实际宫位，供界面展示或调用方检查 | `[&Palace; 2]` |
| 按需 | `Natal::stars()` | 遍历整张命盘的星曜，同时取得各自所属宫位 | `impl Iterator<Item = (&Palace, &Star)> + '_` |

## 建议合同

### 两宫之间的四化

`palace_transformations_between(source, target)` 有方向：只查从 `source` 发出、落入 `target` 的关系，不自动合并反方向。

- 保留源宫四化的 A/B/C/D 顺序；多个化象落入同一目标宫时全部返回。
- 源宫与目标宫相同也可以查询；无命中返回空迭代器。
- 最多检查该源宫的四条关系，不必使用全盘四化来源查询。
- 参数为实际地支；按宫职查询时，先用现有方法定位宫位。

### 单项四化

`palace_transformation(source, kind)` 与现有复数 `palace_transformations(source)` 对应；`birth_transformation(kind)` 与 `birth_transformations()` 对应。

每个合法化象都有唯一结果，建议不返回 `Option`。前者返回按需生成的关系值，后者返回当前命盘内的宫位与星曜借用。实现应复用四化映射，直接定位指定一项，避免为了单项查询先计算完整四项。

### 宫内星曜类别

`stars_by_category(category: StarCategory)` 属于 `Palace`，与现有 `stars()`、`star(name)` 放在一起。

- `StarCategory::Major` 用于读取主星，复用已有类别身份。
- 保留宫内星序；未命中时返回空迭代器，不复制星曜。
- 暂不另加 `main_stars()`、`minor_stars()` 等平行方法；一个带参入口即可覆盖现有类别。
- “没有主星”可由该查询是否为空判断。若将来增加“空宫”或“借星”接口，仍需单独确定其领域含义。

### 相邻宫与全盘星曜

`adjacent_palaces(branch)` 建议固定返回“地支正序的前一宫、后一宫”，例如寅宫返回丑宫、卯宫；不使用依赖盘面朝向的“左／右”命名，也不附加夹宫格局判断。

`Natal::stars()` 建议按宫位寅至丑、各宫现有星序遍历，顺序与 `self_transformations()` 一致；每颗星返回一次。该方法主要方便整盘筛选与展示，不增加新的星曜存储或索引。

## 暂缓的方向

- **按数字年份定位期间**：已有候选 `period_indices_at_year(year)`，但需要先确定年份口径、缺少数字出生年份时的结果，以及超出支持范围的结果。沿用现有[期间查询候选说明](query-api-next.md#后续候选)，不把数字年份直接等同于公历日期。
- **三方／四正内的星曜聚合**：目前可在已有宫位迭代器上组合 `Palace::stars()`；先观察是否反复出现相同调用，再增加专用入口。
- **连续飞化与解释**：遵守 [D-021、D-239 等既有边界](v1-decision-map.md)，不纳入本轮候选。

## 实现边界

以上查询均基于已有只读模型，不需要查询缓存或新增领域对象。已实现的 `palace_transformation` 无堆分配，仅生成指定的一条关系；其余仍是预期实现约束。未测量新增查询的延迟。其余候选定稿时需固定顺序、空结果、借用归属与单项／批量一致性，并同步受影响文档和测试。

当前依据：[公开查询实现](../../crates/ziwei/src/domain/natal.rs)、[宫内查询实现](../../crates/ziwei/src/domain/palace.rs)、[上下文](../../CONTEXT.md)、[现有决策](v1-decision-map.md)。
