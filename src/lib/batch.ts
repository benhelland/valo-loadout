// Runs async tasks with limited concurrency, so a sync job doesn't fire
// thousands of simultaneous requests at the DB (or an upstream API) at once.
export async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
