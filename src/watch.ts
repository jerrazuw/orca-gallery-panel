import { once } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';

export interface WatchTarget {
  path: string;
  recursive: boolean;
  /** Called with the changed path relative to `path`; return false to ignore the change. */
  accept?: (relativePath: string) => boolean;
}

export interface WatchLoopOptions {
  signal: AbortSignal;
  debounceMs?: number;
  /** A target that cannot be watched (a missing folder, for example) is skipped, not fatal. */
  onSkip?: (target: WatchTarget, error: unknown) => void;
}

/**
 * Runs `cycle` once, then again after the targets it returned change. Each run
 * returns fresh targets, so a config change that points at another folder is
 * picked up. Bursts of changes (copying 20 photos) collapse into one run, and
 * changes during a run queue exactly one more. Resolves when `signal` aborts.
 */
export async function watchLoop(
  cycle: () => Promise<readonly WatchTarget[]>,
  { signal, debounceMs = 300, onSkip }: WatchLoopOptions,
): Promise<void> {
  let watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;

  // A function, not a property read, so TypeScript doesn't narrow it across awaits.
  const aborted = (): boolean => signal.aborted;

  const closeAll = (): void => {
    for (const watcher of watchers) watcher.close();
    watchers = [];
  };

  const trigger = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), debounceMs);
  };

  const listen = (targets: readonly WatchTarget[]): void => {
    closeAll();
    for (const target of targets) {
      try {
        const watcher = watch(target.path, { recursive: target.recursive }, (_event, file) => {
          if (file !== null && target.accept && !target.accept(file)) return;
          trigger();
        });
        watcher.on('error', (error) => onSkip?.(target, error));
        watchers.push(watcher);
      } catch (error) {
        onSkip?.(target, error);
      }
    }
  };

  const run = async (): Promise<void> => {
    if (aborted()) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const targets = await cycle();
      if (!aborted()) listen(targets);
    } finally {
      running = false;
    }
    if (queued) {
      queued = false;
      trigger();
    }
  };

  await run();
  if (!aborted()) await once(signal, 'abort');
  clearTimeout(timer);
  closeAll();
}
