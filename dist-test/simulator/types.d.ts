export type InputMode = "user-centric" | "volume-centric";
export interface SimulatorInput {
    mode: InputMode;
    /** User-centric mode: daily active users */
    dau?: number;
    /** User-centric mode: calls per user per day (default: 1) */
    callsPerUserPerDay?: number;
    /** Volume-centric mode: total calls per day */
    totalCallsPerDay?: number;
    /** Per-endpoint frequency multiplier overrides, keyed by endpoint id */
    frequencyOverrides?: Record<string, number>;
}
export interface EndpointSnapshot {
    id: string;
    provider: string;
    method: string;
    url: string;
    /** Baseline daily calls from scan (used to compute per-endpoint share) */
    baseCallsPerDay: number;
    /** Estimated cost per single call in USD */
    perCallCost: number;
    /** AST-derived call frequency pattern — used to suggest default multipliers */
    frequencyClass?: string;
    /** AST-derived pricing model */
    costModel?: "per_token" | "per_transaction" | "per_request" | "free";
}
export interface SimulatorDataSource {
    getEndpoints(): EndpointSnapshot[];
}
export type ConfidenceLevel = "low" | "medium" | "high";
/** A cost expressed as a ±30% range */
export interface CostRange {
    low: number;
    mid: number;
    high: number;
}
export interface EndpointSimResult {
    endpointId: string;
    provider: string;
    method: string;
    url: string;
    scaledCallsPerDay: number;
    dailyCost: CostRange;
    monthlyCost: CostRange;
    percentOfTotal: number;
    costModel?: "per_token" | "per_transaction" | "per_request" | "free";
}
export interface ProviderSimResult {
    provider: string;
    endpoints: EndpointSimResult[];
    dailyCost: CostRange;
    monthlyCost: CostRange;
    percentOfTotal: number;
}
export interface SimulatorResult {
    input: SimulatorInput;
    totalDailyCost: CostRange;
    totalMonthlyCost: CostRange;
    byProvider: ProviderSimResult[];
    confidence: ConfidenceLevel;
    computedAt: string;
}
export interface SavedScenario {
    id: string;
    label: string;
    input: SimulatorInput;
    result: SimulatorResult;
    createdAt: string;
}
export declare const UNCERTAINTY_FACTOR = 0.3;
export declare const SCALE_PRESETS: readonly [{
    readonly label: "1K";
    readonly dau: 1000;
    readonly volume: 1000;
}, {
    readonly label: "10K";
    readonly dau: 10000;
    readonly volume: 10000;
}, {
    readonly label: "50K";
    readonly dau: 50000;
    readonly volume: 100000;
}, {
    readonly label: "100K";
    readonly dau: 100000;
    readonly volume: 1000000;
}];
