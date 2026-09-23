export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function normalizeState<T>(state: T): string {
  return JSON.stringify(state, Object.keys(state as object).sort());
}

export function serialize(state: unknown): string {
  return JSON.stringify(state, null, 2);
}
