/** 编译型使用草图：没有运行时包，不能执行本文件。 */
import { Branch, Gender, PalaceName, StarName, Stem, Transformation, Ziwei, ZiweiError } from './index.js';
import type { Birth, Parameters } from './index.js';

export function fromBirthWorkflow() {
  const birth = {
    gender: Gender.Female,
    birthYear: 1992,
    birthMonth: 8,
    birthDay: 15,
    birthHour: Branch.Mao,
  } satisfies Birth;

  const natal = Ziwei.fromBirth(birth);
  const palaces = natal.palaces;
  const ming = natal.mingPalace();
  const selected = natal.palace(Branch.You);
  const ziwei = natal.star(StarName.ZiWei);
  const optionalStar = natal.palaceStar(selected.branch, StarName.ZuoFu);
  const birthTransformations = natal.birthTransformations();
  const selfTransformations = natal.selfTransformations();
  const outgoing = natal.palaceTransformation(selected.branch, Transformation.A);
  const incoming = natal.palaceTransformationSources(selected.branch);
  const sizheng = natal.sizhengPalaces(selected.branch);

  const decade = natal.decade(0);
  const decadeYears = natal.decadeYears(0);
  const yearly = natal.yearly(0, 0);
  // 两个数组按相同的寅至丑次序对齐，不覆盖本命宫职。
  const rows = palaces.map((palace, index) => ({
    palace,
    decade: decade[index],
    yearly: yearly[index],
  }));
  const decadeMing = natal.decadePalaceByName(0, PalaceName.Ming);
  const atAge = natal.periodIndicesAtAge(25);
  const roleAtAge = atAge === null
    ? null
    : natal.yearlyByBranch(atAge.decade, atAge.yearly, selected.branch);

  // 输出数据不要求继续保留 natal；反序列化后不会自动恢复查询行为。
  const json = JSON.stringify(natal);
  return { rows, ming, ziwei, optionalStar, birthTransformations, selfTransformations,
    outgoing, incoming, sizheng, decadeYears, decadeMing, roleAtAge, json };
}

export function fromParametersWorkflow() {
  const parameters = {
    gender: Gender.Female,
    birthStem: Stem.Ren,
    birthBranch: Branch.Shen,
    birthMonth: 8,
    ziweiBranch: Branch.You,
    birthHour: Branch.Mao,
  } satisfies Parameters;
  const natal = Ziwei.fromParameters(parameters);
  return { profile: natal.profile, years: natal.decadeYears(0), data: natal.toJSON() };
}

export function handleBirth(birth: Birth) {
  try {
    return { natal: Ziwei.fromBirth(birth) };
  } catch (error: unknown) {
    if (!(error instanceof ZiweiError)) throw error;
    const detail = error.detail;
    switch (detail.code) {
      case 'INVALID_ARGUMENT':
        return { message: error.message, path: detail.path, reason: detail.reason };
      case 'INVALID_SEXAGENARY_YEAR':
        return { message: error.message, stem: detail.stem, branch: detail.branch };
      case 'INVALID_LUNISOLAR_MONTH':
      case 'INVALID_LUNISOLAR_DAY':
      case 'INVALID_DECADE_INDEX':
      case 'INVALID_YEARLY_INDEX':
        return { message: error.message, value: detail.value };
      default: {
        const exhaustive: never = detail;
        return exhaustive;
      }
    }
  }
}
