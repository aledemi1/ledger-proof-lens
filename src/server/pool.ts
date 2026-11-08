/** Runs at most `concurrency` jobs at once. Extra jobs wait for a free slot. */
export function createLimiter(concurrency: number) {
  const slots = Math.max(1, concurrency);
  let active = 0;
  const waiting: Array<() => void> = [];

  return function limit<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        job().then(resolve, reject).finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < slots) start();
      else waiting.push(start);
    });
  };
}

export function workerCount(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  if (Number.isInteger(raw) && raw >= 1 && raw <= 8) return raw;
  return Math.max(1, fallback);
}
