// Starts the payment watcher inside the Next.js server process (one process, one SQLite file).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ZEALED_WATCHER !== "off") {
    const { startWatcher } = await import("./worker/watcher");
    startWatcher();
  }
}
