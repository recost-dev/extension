import { ApiCallMatch, HttpCallMatch } from "./patterns/types";
export type { ApiCallMatch, HttpCallMatch };
export declare function matchNormalizedLine(line: string): ApiCallMatch[];
export declare function matchLine(line: string): HttpCallMatch[];
export declare function matchNormalizedRouteDefinitionLine(line: string): ApiCallMatch[];
export declare function matchRouteDefinitionLine(line: string): HttpCallMatch[];
export declare function isInsideLoop(lines: string[], currentIndex: number): boolean;
