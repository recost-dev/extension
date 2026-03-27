const HARD_EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "docs",
  "examples",
  "dist",
  "dist-test",
  "dashboard-dist",
  "build",
  "coverage",
  ".git",
  ".next",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
]);

export function isHardExcludedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.some((segment) => HARD_EXCLUDED_SEGMENTS.has(segment));
}
