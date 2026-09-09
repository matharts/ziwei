# 导入排序：来源对照与设计依据

核对日期：2026-09-10。本文区分工具默认、官方示例和开源项目偏好；这些来源没有形成统一的行业排序标准。本仓库使用 Oxfmt 0.67.0，配置能力以该版本发布的 schema 为准。

## 官方来源对照

| 来源 | 实际规定或示例 | 可用于本仓库的依据 |
| --- | --- | --- |
| [Oxfmt 排序指南](https://oxc.rs/docs/guide/usage/formatter/sorting) | 导入排序默认关闭；教程提供采用 Perfectionist 默认顺序的类型优先示例，也提供类型后置、自定义组的示例 | 示例展示可选布局，不代表 Oxfmt 默认顺序或必须遵守的推荐 |
| [Oxfmt 配置参考](https://oxc.rs/docs/guide/usage/formatter/config-file-reference#sortimports) | 启用后的默认组为 `builtin`、`external`、`[internal, subpath]`、`[parent, sibling, index]`、`style`、`unknown` | 按导入来源阅读是工具直接支持的默认选择；默认分组没有单独的全局类型组 |
| [Perfectionist sort-imports](https://perfectionist.dev/rules/sort-imports) | 默认字母升序、忽略大小写；默认分组含类型组，内置值导入与外部值导入合组 | 可参考类型与值分开的阅读方式；其分组和配置 API 不等于 Oxfmt 的默认或完整能力 |

Oxfmt 默认 `order: "asc"`、`ignoreCase: true`、`newlinesBetween: true`、`partitionByComment: false`、`partitionByNewline: false`、`sortSideEffects: false`。这些值是启用排序后的字段默认值，不能据此认为 `sortImports` 本身默认开启。[Oxfmt 配置参考](https://oxc.rs/docs/guide/usage/formatter/config-file-reference#sortimports)

## 版本与字段差异

[Oxfmt 0.67.0 发布 schema](https://github.com/oxc-project/oxc/blob/b4da00b621ec2f6f67ed218f5366c45ed325331b/npm/oxfmt/configuration_schema.json#L707) 的 `SortImportsConfig` 仅包含：

```text
customGroups, groups, ignoreCase, internalPattern, newlinesBetween,
order, partitionByComment, partitionByNewline, sortSideEffects
```

| 项目 | Oxfmt 0.67.0 | Perfectionist 当前文档 |
| --- | --- | --- |
| 排序方法 | 没有可配置的 `type` 字段 | `type` 可选择 alphabetical、natural、line-length 等 |
| 内部路径识别 | `internalPattern` 是路径前缀；默认 `~/`、`@/`、`#` | `internalPattern` 使用正则表达式 |
| 自定义来源匹配 | `customGroups[].elementNamePattern` 是 glob 数组 | `elementNamePattern` 使用正则表达式 |
| 组间空行 | `newlinesBetween` 为布尔值 | 可指定数量或 `"ignore"` |
| 空行分区字段 | `partitionByNewline` | `partitionByNewLine`，大小写不同 |
| 其他选项 | 没有 `sortBy`、`locales`、`fallbackSort`、`tsconfig` | 提供这些选项 |

差异依据：[版本固定的 Oxfmt schema](https://github.com/oxc-project/oxc/blob/b4da00b621ec2f6f67ed218f5366c45ed325331b/npm/oxfmt/configuration_schema.json)、[Perfectionist 规则文档](https://perfectionist.dev/rules/sort-imports)。迁移时应翻译意图并核对字段，不能直接复制整段配置。

Oxfmt 不会通过读取 `tsconfig.json` 自动解析路径别名；需要识别内部模块时，应使用真实存在的前缀或自定义匹配。教程中的 React 分组及 `@/`、`~/` 前缀都不是本仓库必须添加的配置。[Oxfmt 排序指南](https://oxc.rs/docs/guide/usage/formatter/sorting)

## Oxc 与 Rolldown 的项目现状

以下固定到核对时的 commit，描述根工程配置，不推断所有文件或测试夹具都采用同一规则。

| 项目快照 | 格式化入口与配置 | 对导入排序的证据边界 |
| --- | --- | --- |
| Oxc `0df2b6c1976e8f40ad9a6555c90acb8f54da8311` | [package.json](https://github.com/oxc-project/oxc/blob/0df2b6c1976e8f40ad9a6555c90acb8f54da8311/package.json) 的 `fmt` 调用 `oxfmt -c oxfmtrc.jsonc`；[oxfmtrc.jsonc](https://github.com/oxc-project/oxc/blob/0df2b6c1976e8f40ad9a6555c90acb8f54da8311/oxfmtrc.jsonc) 设置操作符位置和忽略范围 | 根 formatter 配置没有启用 `sortImports`，因此不能作为某种导入分组顺序的背书 |
| Rolldown `9704b565076baf57b3703c98ebde973855506a68` | [justfile](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/justfile) 使用 `vp fmt`；[vite.config.ts](https://github.com/rolldown/rolldown/blob/9704b565076baf57b3703c98ebde973855506a68/vite.config.ts) 的 `fmt` 设置单引号和忽略范围 | 当前走 Vite+ 入口，`fmt` 未显式设置 `sortImports` 或分组；不能将它描述为一份可照搬的 Oxfmt 导入排序配置 |

## 可选设计的依据

- 按来源分组：沿用 Oxfmt 默认分类，便于先区分运行环境、依赖与项目模块；显式列出默认值可以让仓库约定更易审阅。
- 类型单独分组：官方示例和 Perfectionist 默认提供依据，适用于希望集中阅读类型依赖的项目；是否采用取决于本项目阅读习惯。[Oxfmt 示例](https://oxc.rs/docs/guide/usage/formatter/sorting)
- 内部命名空间：使用项目实际拥有的包名前缀或路径别名；`internalPattern` 只参与分类，不会建立新的模块解析别名。[字段定义](https://oxc.rs/docs/guide/usage/formatter/config-file-reference#sortimports-internalpattern)
- 分区与空行：`partitionByComment: true` 让注释成为显式边界；`partitionByNewline: false` 则让既有空行不阻止统一分组。这是两种不同的分区选择。[字段定义](https://oxc.rs/docs/guide/usage/formatter/config-file-reference#sortimports-partitionbycomment)
- 副作用导入：保留 `sortSideEffects: false` 有官方默认依据，但它不承诺其他导入不能跨越副作用导入；初始化次序的边界仍需显式注释和行为验证，见[工程验证](../agents/engineering.md#lint-与格式化)。

## 本仓库采用的方案

[根 Oxfmt 配置](../../.oxfmtrc.json)沿用按来源分组，显式指定升序、忽略大小写和组间空行。类型导入随来源放置，不增加全局类型组，也不改写 `import type`。

内部命名空间只配置实际使用的 `@matharts/`；`#` 子路径由 `subpath` 组处理。不添加未使用的 `@/`、`~/` 别名或 React 等特殊分组。注释分区开启、空行分区关闭，副作用导入不参与排序；由 Oxfmt 单独负责排序，不叠加同类 lint 规则。

[配置回归测试](../../tools/tests/quality.test.ts)覆盖分组、命名空间前缀边界、类型语义、大小写、空行、重复格式化幂等性，以及副作用导入固定位置和注释边界。日常检查入口见[工程验证约定](../agents/engineering.md#lint-与格式化)。
