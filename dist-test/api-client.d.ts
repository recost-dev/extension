import type { ApiCallInput, EndpointRecord, Suggestion, ScanSummary } from "./analysis/types";
export declare function createProject(name: string, ecoApiKey?: string): Promise<string>;
export declare function validateEcoApiKey(ecoApiKey: string): Promise<void>;
export interface ScanResult {
    scanId: string;
    summary: ScanSummary;
}
export declare function submitScan(projectId: string, apiCalls: ApiCallInput[], ecoApiKey?: string): Promise<ScanResult>;
export declare function getAllEndpoints(projectId: string, scanId: string): Promise<EndpointRecord[]>;
export declare function getAllSuggestions(projectId: string, scanId: string): Promise<Suggestion[]>;
