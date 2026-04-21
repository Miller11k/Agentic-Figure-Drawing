import { spawnSync } from "node:child_process";
import path from "node:path";

const nextBinary = path.join("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");

const result = spawnSync(nextBinary, ["build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-build",
    NEXT_PRIVATE_BUILD_WORKER: process.env.NEXT_PRIVATE_BUILD_WORKER ?? "1",
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1"
  }
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
