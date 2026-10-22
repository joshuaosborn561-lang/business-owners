export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  opts?: {
    shouldStop?: () => boolean;
    onItem?: (item: T, result: R, index: number) => void | Promise<void>;
  },
): Promise<R[]> {
  const width = Math.max(1, Math.min(concurrency, items.length || 1));
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      if (opts?.shouldStop?.()) return;
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      if (opts?.onItem) await opts.onItem(items[i], out[i], i);
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
  return out;
}
