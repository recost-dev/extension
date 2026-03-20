import type { Severity, SuggestionType } from "../analysis/types";
export interface LocalWasteFinding {
    id: string;
    type: SuggestionType;
    severity: Severity;
    confidence: number;
    description: string;
    affectedFile: string;
    line?: number;
    evidence: string[];
}
export declare function detectLocalWasteFindingsInText(relativePath: string, text: string): LocalWasteFinding[];
