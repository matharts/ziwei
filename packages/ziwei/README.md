# @matharts/ziwei

纯 TypeScript 紫微排盘库。Node.js 与浏览器使用相同 ESM 包根入口；API 同步执行，不加载 Rust、原生扩展或 Wasm。包尚未发布到 npm，当前通过本地打包消费。

源码以 `src/index.ts` 为唯一公开入口。内部按职责组织：`domain/` 保存领域身份、公开类型、错误、输入校验及宫干与五行局规则；`chart/` 计算本命事实并持有命盘查询状态；`stars/` 保存星曜目录、落宫规则、共享星曜值与四化查询；`palaces/` 保存宫职名称、宫位物化与期间布局。依赖从命盘句柄向宫位、星曜及领域规则单向流动；模块直接依赖所需文件，不通过内部汇总入口转发。

领域身份常量独立于错误处理；身份转换、建盘输入校验、查询参数校验和基础约束分别在 `domain/identity-queries.ts`、`domain/inputs.ts`、`domain/validation.ts` 与 `domain/constraints.ts`。

## 使用

需要 Node.js 24.15.0 或更高版本。取得本地 `.tgz` 后在应用中安装：

```sh
pnpm add /path/to/matharts-ziwei.tgz
```

```ts
import { Ziwei, Gender, Branch, StarName, PalaceName } from "@matharts/ziwei";

const natal = Ziwei.fromBirth({
  gender: Gender.Male,
  birthYear: 1984,
  birthMonth: 1,
  birthDay: 6,
  birthHour: Branch.Zi,
});

console.log(natal.palaceByName(PalaceName.Ming).branch); // 2，寅
console.log(natal.palaceByStar(StarName.ZiWei).star(StarName.ZiWei)?.nameHans); // 紫微
console.log(natal.star(StarName.WuQu).birthTransformation); // C
console.log(natal.decadeYears(1)[0]); // { age: 16, year: 1999 }
```

`birthMonth` 为已归一化农历月份 `1..12`，`birthDay` 为日期 `1..30`，`birthHour` 使用子至亥的地支身份 `0..11`，不是钟表小时。本包不做公历转换、闰月辨识、时区、晚子时或真太阳时处理。

已知干支和紫微所在地支时，也可直接建盘：

```ts
import { Ziwei, Gender, Stem, Branch } from "@matharts/ziwei";

const natal = Ziwei.fromParameters({
  gender: Gender.Male,
  birthStem: Stem.Jia,
  birthBranch: Branch.Zi,
  birthMonth: 1,
  ziweiBranch: Branch.Yin,
  birthHour: Branch.Zi,
});

console.log(natal.profile.birthYear); // null
console.log(natal.profile.birthDay); // null
console.log(natal.decadeYears(1)[0]); // { age: 16, year: null }
```

两类输入均得到不可变本命盘。`Palace.star(name)` 在宫内未找到星曜时返回 `null`，全盘 `Natal.star(name)` 返回唯一星曜。`periodIndicesAtAge` 对有效但不在十二大限覆盖范围内的虚岁返回 `null`。非法输入抛出 `ZiweiError`，可读取 `code` 和 `detail`。

完整 API、Rust 能力映射与验证边界见 [TypeScript API](../../docs/architecture/typescript-api.md)。旧 `@matharts/ziwei-wasm` 消费端需要改用包根导入，并移除 `initialize()`、`dispose()` 和 `wasmUrl` 配置；旧 Node 门面的 `palaceStar` 与 `toJSON` 不在新 API 中。
