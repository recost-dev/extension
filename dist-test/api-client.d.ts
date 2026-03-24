import type { ApiCallInput, EndpointRecord, Suggestion, ScanSummary } from "./analysis/types";
export declare function createProject(name: string, rcApiKey?: string): Promise<string>;
export declare function validateRcApiKey(rcApiKey: string): Promise<void>;
export interface ScanResult {
    scanId: string;
    summary: ScanSummary;
}
export declare function submitScan(projectId: string, apiCalls: ApiCallInput[], rcApiKey?: string): Promise<ScanResult>;
export declare function getAllEndpoints(projectId: string, scanId: string, rcApiKey?: string): Promise<EndpointRecord[]>;
export declare function getAllSuggestions(projectId: string, scanId: string, rcApiKey?: string): Promise<Suggestion[]>;
export interface AuthMeUser {
    email: string;
}
/**
 * Validates an API key against GET /auth/me.
 * Returns AuthMeUser on success, null for 404 (dev mode — endpoint not yet deployed).
 * Throws with err.status === 401 for invalid key.
 * Throws without .status for network errors.
 */
export declare function validateApiKey(key: string): Promise<AuthMeUser | null>;
