"use strict";
// ─── Input ───────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCALE_PRESETS = exports.UNCERTAINTY_FACTOR = void 0;
// ─── Constants ────────────────────────────────────────────────────────────────
exports.UNCERTAINTY_FACTOR = 0.3;
exports.SCALE_PRESETS = [
    { label: "1K", dau: 1_000, volume: 1_000 },
    { label: "10K", dau: 10_000, volume: 10_000 },
    { label: "50K", dau: 50_000, volume: 100_000 },
    { label: "100K", dau: 100_000, volume: 1_000_000 },
];
//# sourceMappingURL=types.js.map