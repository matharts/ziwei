import { argumentError } from './error.js';

/** Capture each own data property once; never invoke accessors or retain the input. */
export function capture(input: unknown, fields: readonly string[], missing: boolean): unknown[] {
  if (missing) throw argumentError([], 'missing');
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw argumentError([], 'type', input);
  }
  const values: unknown[] = [];
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor) throw argumentError([field], 'missing');
    if (!Object.hasOwn(descriptor, 'value')) throw argumentError([field], 'accessor');
    values.push(descriptor.value);
  }
  let firstExtra: string | undefined;
  let hasSymbol = false;
  // Keep default string-sort precedence without allocating or sorting extra keys.
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key === 'symbol') {
      hasSymbol = true;
    } else if (!fields.includes(key) && (firstExtra === undefined || key < firstExtra)) {
      firstExtra = key;
    }
  }
  if (firstExtra !== undefined) throw argumentError([firstExtra], 'unknown_field');
  if (hasSymbol) throw argumentError([], 'unknown_field');
  return values;
}
/** Positional omission is distinct from an explicitly supplied undefined value. */
export function arity(count: number, ...names: string[]): void {
  const missing = names[count];
  if (missing !== undefined) throw argumentError([missing], 'missing');
}
