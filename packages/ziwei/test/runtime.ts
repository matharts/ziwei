/** Exercise JavaScript callers' invalid arguments without weakening the public TS contract. */
export function invoke<F extends (...args: never[]) => unknown>(
  fn: F,
  receiver: unknown,
  ...args: unknown[]
): ReturnType<F> {
  return Reflect.apply(fn, receiver, args);
}
