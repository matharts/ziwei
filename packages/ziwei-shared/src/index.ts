export { capture, arity } from "./input.js";
export { ZiweiError, argumentError, nativeError, unwrap } from "./error.js";
export type {
  ArgumentFailureReason,
  ReceivedValue,
  ZiweiErrorCode,
  ZiweiErrorDetail,
} from "./error.js";
export type {
  Gender,
  Stem,
  Branch,
  PalaceName,
  StarName,
  StarCategory,
  StarGalaxy,
  Transformation,
} from "./identity-types.js";
export {
  projectProfile,
  projectStar,
  projectPalace,
  projectLocatedStar,
  projectPalaceTransformation,
} from "./projection.js";
export type {
  BirthMonth,
  BirthDay,
  Profile,
  Star,
  Palace,
  SelfTransformations,
  DecadeAgeRange,
  LocatedStar,
  PalaceTransformation,
} from "./projection.js";
