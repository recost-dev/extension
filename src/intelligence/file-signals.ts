const TEST_FILE_PATTERNS = [
  /(^|\/)src\/test\//,
  /(^|\/)__tests__\//,
  /(^|\/)test\//,
  /(^|\/)tests\//,
  /\.test\.[^/]+$/i,
  /\.spec\.[^/]+$/i,
] as const;

const GENERATED_FILE_PATTERNS = [
  /(^|\/)dashboard-dist\//,
  /(^|\/)dist\//,
  /(^|\/)dist-test\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /(^|\/)assets\/index-[^/]+\.(js|css)$/i,
] as const;

const ANALYSIS_TOOLING_FILE_PATTERNS = [
  /(^|\/)src\/scanner\/patterns\//,
  /(^|\/)src\/ast\/call-visitor\.ts$/,
] as const;

export function isTestLikeFilePath(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isGeneratedLikeFilePath(filePath: string): boolean {
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isAnalysisToolingFilePath(filePath: string): boolean {
  return ANALYSIS_TOOLING_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isDeprioritizedContextFilePath(filePath: string): boolean {
  return isGeneratedLikeFilePath(filePath) || isAnalysisToolingFilePath(filePath);
}
