// Cross-platform wrapper for the alchemy CLI. package.json can't use
// `NODE_OPTIONS="$NODE_OPTIONS --experimental-strip-types" alchemy` on Windows
// cmd (pnpm's script runner), which is required to load alchemy.run.ts.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "alchemy", "bin", "cli.js");
if (!existsSync(cli)) {
  console.error(
    `alchemy CLI not found at ${cli} — run pnpm install from the repo root.`,
  );
  process.exit(1);
}

const flag = "--experimental-strip-types";
const existing = process.env.NODE_OPTIONS ?? "";
const env = {
  ...process.env,
  NODE_OPTIONS: existing.includes(flag)
    ? existing
    : `${existing} ${flag}`.trim(),
};

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
