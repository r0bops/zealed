// Watcher liveness, shared through globalThis: Next bundles the watcher (started from instrumentation)
// and API routes separately, so module-level state wouldn't be visible to the health route.
export interface WatcherStatus {
  startedAt: number | null;
  lastTickAt: number | null;
  lastError: boolean; // true when the most recent tick failed
}

const g = globalThis as unknown as { __zealedWatcherStatus?: WatcherStatus };

export function watcherStatus(): WatcherStatus {
  return (g.__zealedWatcherStatus ??= { startedAt: null, lastTickAt: null, lastError: false });
}

export function markWatcherStarted(at = Date.now()) {
  watcherStatus().startedAt = at;
}

export function markWatcherTick(ok: boolean, at = Date.now()) {
  const s = watcherStatus();
  s.lastTickAt = at;
  s.lastError = !ok;
}
