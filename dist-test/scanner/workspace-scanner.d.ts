import { ApiCallInput } from "../analysis/types";
export interface LocalWasteFinding {
    id: string;
    type: "cache" | "batch" | "redundancy" | "n_plus_one" | "rate_limit";
    severity: "high" | "medium" | "low";
    description: string;
    affectedFile: string;
    line?: number;
}
export interface ScanProgress {
    file: string;
    index: number;
    total: number;
    endpointsSoFar: number;
}
export declare function readWorkspaceFileExcerpt(relativePath: string, options?: {
    centerLine?: number;
    contextLines?: number;
    maxChars?: number;
}): Promise<{
    content: string;
    startLine: number;
    endLine: number;
} | null>;
export declare function scanWorkspace(onProgress?: (progress: ScanProgress) => void): Promise<ApiCallInput[]>;
export declare function detectLocalWastePatterns(): Promise<LocalWasteFinding[]>;
