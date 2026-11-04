// Next copies .env/.env.production independently of outputFileTracingExcludes.
// Deploy credentials through runtime environment variables, not build artifacts.
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), ".next", "standalone");
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && /^\.env(?:\.|$)/.test(entry.name)) await unlink(join(root, entry.name));
}
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (/\.db(?:-(?:wal|shm|journal))?$/.test(entry.name) || /^\.env(?:\.|$)/.test(entry.name)) {
      throw new Error("Unsafe standalone artifact: environment or database file included. Review output tracing before deployment.");
    }
  }
}
await check(root);
console.log("Standalone artifact checked: no environment files or local databases outside dependencies.");
