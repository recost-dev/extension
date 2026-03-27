import assert from "node:assert/strict";

import { isHardExcludedPath } from "../scanner/path-excludes";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("hard exclude path blocks generated build and test output directories", () => {
  assert.equal(isHardExcludedPath("dist/file.js"), true);
  assert.equal(isHardExcludedPath("packages/api/dist-test/client.js"), true);
  assert.equal(isHardExcludedPath("src/__pycache__/module.py"), true);
  assert.equal(isHardExcludedPath("src/features/context.ts"), false);
});
