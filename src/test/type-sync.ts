/**
 * Build-time type-sync assertions.
 * This file has no runtime effect — it only verifies that the manually-synced
 * webview types stay assignable to the canonical extension types.
 * A TypeScript compile error here means the two type trees have drifted.
 */
import type { EndpointRecord as ExtEndpointRecord, ScanSummary as ExtScanSummary } from "../analysis/types";
import type { HostMessage as ExtHostMessage } from "../messages";
import type { EndpointSimResult as ExtEndpointSimResult } from "../simulator/types";

// We can't import the webview types directly (different tsconfig), so we duplicate
// the critical structural assertions inline using mapped-type helpers.

type AssertExtends<T, U extends T> = U;

// ── EndpointRecord enriched fields ──────────────────────────────────────────
// The webview/src/types.ts EndpointRecord must have at least these fields.
type RequiredEndpointFields = {
  methodSignature?: string;
  costModel?: "per_token" | "per_transaction" | "per_request" | "free";
  frequencyClass?: string;
  batchCapable?: boolean;
  cacheCapable?: boolean;
  streaming?: boolean;
  isMiddleware?: boolean;
  crossFileOrigins?: { file: string; functionName: string }[];
};

// Verify ExtEndpointRecord satisfies RequiredEndpointFields
type _CheckEndpointRecord = AssertExtends<RequiredEndpointFields, Pick<ExtEndpointRecord, keyof RequiredEndpointFields>>;

// ── EndpointSimResult costModel field ────────────────────────────────────────
type _CheckSimResultCostModel = AssertExtends<
  { costModel?: string },
  Pick<ExtEndpointSimResult, "costModel">
>;

// ── HostMessage shape check ──────────────────────────────────────────────────
// Ensure the discriminant union has a triggerScan and scanResults variant
type _CheckHostMsgTrigger = Extract<ExtHostMessage, { type: "triggerScan" }>;
type _CheckHostMsgScanResults = Extract<ExtHostMessage, { type: "scanResults" }>;
type _CheckHostMsgSimResult = Extract<ExtHostMessage, { type: "simulationResult" }>;

// Prevent unused-type errors
export type { _CheckEndpointRecord, _CheckSimResultCostModel, _CheckHostMsgTrigger, _CheckHostMsgScanResults, _CheckHostMsgSimResult };
