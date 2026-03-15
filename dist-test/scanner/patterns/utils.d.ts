import { ApiCallMatch, HttpCallMatch } from "./types";
export declare function toSnakeCase(value: string): string;
export declare function normalizeMethod(value: string | undefined, fallback?: string): string;
export declare function parseHost(url: string | undefined): string | undefined;
export declare function uniqueMatches(matches: ApiCallMatch[]): ApiCallMatch[];
export declare function toHttpCallMatches(matches: ApiCallMatch[]): HttpCallMatch[];
export declare function normalizeDynamic(raw: string): string;
export declare function withRisk(match: ApiCallMatch, risk: string): ApiCallMatch;
