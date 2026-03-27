import { ApiCallInput } from "../analysis/types";
import { type LocalWasteFinding } from "./local-waste-detector";
export interface ScanProgress {
    file: string;
    index: number;
    total: number;
    endpointsSoFar: number;
}
export declare function countScopedWorkspaceFiles(): Promise<number>;
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
