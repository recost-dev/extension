export function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}
