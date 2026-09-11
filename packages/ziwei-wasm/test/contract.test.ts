import type * as Native from "@matharts/ziwei";
import type * as Wasm from "@matharts/ziwei-wasm";
import { initialize } from "@matharts/ziwei-wasm";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type Contract = [
  Assert<Equal<Wasm.Birth, Native.Birth>>,
  Assert<Equal<Wasm.Parameters, Native.Parameters>>,
  Assert<Equal<Wasm.Profile, Native.Profile>>,
  Assert<Equal<Wasm.Star, Native.Star>>,
  Assert<Equal<Wasm.Palace, Native.Palace>>,
  Assert<Equal<Wasm.NatalSnapshot, Native.NatalSnapshot>>,
  Assert<Equal<Wasm.ZiweiErrorDetail, Native.ZiweiErrorDetail>>,
  Assert<Equal<Omit<Wasm.Natal, "dispose">, Native.Natal>>,
];

declare const natal: Wasm.Natal;
declare const runtime: Wasm.ReadyZiweiRuntime;
declare const snapshot: Wasm.NatalSnapshot;
natal.dispose();
// @ts-expect-error Wasm initialization is explicit, no top-level Ziwei value exists.
void import("@matharts/ziwei-wasm").then((module) => module.Ziwei);
// @ts-expect-error A loading Promise is not a ready runtime.
void initialize().Ziwei;
// @ts-expect-error Only URL resources, not ambiguous relative strings.
initialize({ wasmUrl: "./ziwei.wasm" });
// @ts-expect-error Cancellation is not part of this Interface.
initialize({ signal: new AbortController().signal });
// @ts-expect-error Facts stay readonly.
natal.profile.birthMonth = 2;
// @ts-expect-error A snapshot cannot restore a native/Wasm holder.
runtime.Ziwei.fromJSON(snapshot);
// @ts-expect-error Wrong identity family.
natal.star(runtime.PalaceName.Ming);
