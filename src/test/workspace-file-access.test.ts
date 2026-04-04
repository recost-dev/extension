import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { resolveWorkspaceFilePathSafely } from "../workspace-file-access";

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function withTempWorkspace(fn: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recost-workspace-file-access-"));
  try {
    await fn(tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

(async () => {
  await run("allows a valid relative path inside the workspace", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const filePath = path.join(workspaceRoot, "src", "safe.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "export const ok = true;\n", "utf8");

      const resolved = await resolveWorkspaceFilePathSafely(workspaceRoot, "src/safe.ts");
      assert.equal(resolved, await fs.realpath(filePath));
    });
  });

  await run("rejects traversal outside the workspace", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const resolved = await resolveWorkspaceFilePathSafely(workspaceRoot, "../../.bashrc");
      assert.equal(resolved, null);
    });
  });

  await run("rejects absolute path input", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const absolutePath = path.resolve(workspaceRoot, "src/safe.ts");
      const resolved = await resolveWorkspaceFilePathSafely(workspaceRoot, absolutePath);
      assert.equal(resolved, null);
    });
  });

  await run("rejects NUL-byte input", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const resolved = await resolveWorkspaceFilePathSafely(workspaceRoot, "src/safe.ts\0evil");
      assert.equal(resolved, null);
    });
  });

  await run("rejects symlink escapes outside the workspace", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recost-workspace-outside-"));
      try {
        const outsideFile = path.join(outsideRoot, "outside.txt");
        await fs.writeFile(outsideFile, "secret\n", "utf8");

        const symlinkPath = path.join(workspaceRoot, "linked.txt");
        await fs.symlink(outsideFile, symlinkPath);

        const resolved = await resolveWorkspaceFilePathSafely(workspaceRoot, "linked.txt");
        assert.equal(resolved, null);
      } finally {
        await fs.rm(outsideRoot, { recursive: true, force: true });
      }
    });
  });
})();
