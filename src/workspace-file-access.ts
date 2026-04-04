import * as fs from "fs/promises";
import * as path from "path";

export async function resolveWorkspaceFilePathSafely(
  workspaceRoot: string,
  file: string
): Promise<string | null> {
  if (!file || file.includes("\0") || path.isAbsolute(file)) {
    return null;
  }

  const resolvedPath = path.resolve(workspaceRoot, file);
  const relativePath = path.relative(workspaceRoot, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  try {
    const [realWorkspaceRoot, realResolvedPath] = await Promise.all([
      fs.realpath(workspaceRoot),
      fs.realpath(resolvedPath),
    ]);

    const realRelativePath = path.relative(realWorkspaceRoot, realResolvedPath);
    if (realRelativePath.startsWith("..") || path.isAbsolute(realRelativePath)) {
      return null;
    }

    return realResolvedPath;
  } catch {
    return null;
  }
}
