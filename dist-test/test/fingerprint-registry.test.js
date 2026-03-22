"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../scanner/fingerprints/index");
function run(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    }
    catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}
// ── helpers ──────────────────────────────────────────────────────────────────
function findProvider(id) {
    const p = index_1.ALL_PROVIDERS.find((x) => x.provider === id);
    strict_1.default.ok(p, `provider "${id}" not found in ALL_PROVIDERS`);
    return p;
}
function findMethod(provider, pattern) {
    const m = provider.methods.find((x) => x.pattern === pattern);
    strict_1.default.ok(m, `method "${pattern}" not found in provider "${provider.provider}"`);
    return m;
}
// ── 1. Schema validation ─────────────────────────────────────────────────────
run("all 10 providers are present", () => {
    const expected = [
        "openai", "anthropic", "stripe", "supabase", "firebase",
        "aws-bedrock", "gemini", "cohere", "mistral", "vertex-ai",
    ];
    for (const id of expected) {
        strict_1.default.ok(index_1.ALL_PROVIDERS.some((p) => p.provider === id), `missing provider: ${id}`);
    }
    strict_1.default.equal(index_1.ALL_PROVIDERS.length, 10);
});
run("every provider has required top-level fields", () => {
    for (const p of index_1.ALL_PROVIDERS) {
        strict_1.default.ok(p.schemaVersion, `${p.provider}: missing schemaVersion`);
        strict_1.default.ok(p.provider, `${p.provider}: missing provider`);
        strict_1.default.ok(p.displayName, `${p.provider}: missing displayName`);
        strict_1.default.ok(Array.isArray(p.languages) && p.languages.length > 0, `${p.provider}: languages must be a non-empty array`);
        strict_1.default.ok(Array.isArray(p.packages) && p.packages.length > 0, `${p.provider}: packages must be a non-empty array`);
        strict_1.default.ok(Array.isArray(p.hosts) && p.hosts.length > 0, `${p.provider}: hosts must be a non-empty array`);
        strict_1.default.ok(Array.isArray(p.methods) && p.methods.length > 0, `${p.provider}: methods must be a non-empty array`);
        strict_1.default.equal(p.schemaVersion, "1.0.0", `${p.provider}: schemaVersion should be 1.0.0`);
    }
});
// ── 2. Method field completeness ─────────────────────────────────────────────
run("every method has pattern, httpMethod, endpoint, costModel", () => {
    for (const p of index_1.ALL_PROVIDERS) {
        for (const m of p.methods) {
            strict_1.default.ok(m.pattern, `${p.provider}: method missing pattern`);
            strict_1.default.ok(m.httpMethod, `${p.provider}/${m.pattern}: missing httpMethod`);
            strict_1.default.ok(m.endpoint, `${p.provider}/${m.pattern}: missing endpoint`);
            strict_1.default.ok(m.costModel, `${p.provider}/${m.pattern}: missing costModel`);
            strict_1.default.ok(["per_token", "per_transaction", "per_request", "free"].includes(m.costModel), `${p.provider}/${m.pattern}: invalid costModel "${m.costModel}"`);
        }
    }
});
run("every method httpMethod is a known verb", () => {
    const VALID = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "SUBSCRIBE", "RPC"]);
    for (const p of index_1.ALL_PROVIDERS) {
        for (const m of p.methods) {
            strict_1.default.ok(VALID.has(m.httpMethod), `${p.provider}/${m.pattern}: unknown httpMethod "${m.httpMethod}"`);
        }
    }
});
// ── 3. No duplicate patterns within a provider ───────────────────────────────
run("no duplicate method patterns within a provider", () => {
    for (const p of index_1.ALL_PROVIDERS) {
        const seen = new Set();
        for (const m of p.methods) {
            strict_1.default.ok(!seen.has(m.pattern), `${p.provider}: duplicate pattern "${m.pattern}"`);
            seen.add(m.pattern);
        }
    }
});
// ── 4. Known method lookups ───────────────────────────────────────────────────
run("openai chat.completions.create → POST, per_token", () => {
    const p = findProvider("openai");
    const m = findMethod(p, "chat.completions.create");
    strict_1.default.equal(m.httpMethod, "POST");
    strict_1.default.equal(m.costModel, "per_token");
    strict_1.default.match(m.endpoint, /api\.openai\.com\/v1\/chat\/completions/);
    strict_1.default.ok(typeof m.inputPricePer1M === "number");
    strict_1.default.ok(typeof m.outputPricePer1M === "number");
});
run("anthropic messages.create → POST, correct endpoint", () => {
    const p = findProvider("anthropic");
    const m = findMethod(p, "messages.create");
    strict_1.default.equal(m.httpMethod, "POST");
    strict_1.default.equal(m.endpoint, "https://api.anthropic.com/v1/messages");
    strict_1.default.equal(m.costModel, "per_token");
});
run("anthropic messages.stream → streaming flag set", () => {
    const p = findProvider("anthropic");
    const m = findMethod(p, "messages.stream");
    strict_1.default.equal(m.streaming, true);
});
run("anthropic messageBatches.create → batchCapable, discounted pricing", () => {
    const p = findProvider("anthropic");
    const m = findMethod(p, "messageBatches.create");
    strict_1.default.equal(m.batchCapable, true);
    // batch pricing should be cheaper than regular messages
    const msg = findMethod(p, "messages.create");
    strict_1.default.ok((m.inputPricePer1M ?? 0) < (msg.inputPricePer1M ?? 999));
});
run("stripe paymentIntents.create → per_transaction with fees", () => {
    const p = findProvider("stripe");
    const m = findMethod(p, "paymentIntents.create");
    strict_1.default.equal(m.costModel, "per_transaction");
    strict_1.default.ok(typeof m.fixedFee === "number" && m.fixedFee > 0);
    strict_1.default.ok(typeof m.percentageFee === "number" && m.percentageFee > 0);
});
run("bedrock ConverseStreamCommand → POST, streaming, per_token", () => {
    const p = findProvider("aws-bedrock");
    const m = findMethod(p, "ConverseStreamCommand");
    strict_1.default.equal(m.httpMethod, "POST");
    strict_1.default.equal(m.streaming, true);
    strict_1.default.equal(m.costModel, "per_token");
    strict_1.default.match(m.endpoint, /converse-stream/);
});
run("gemini models.generateContent → per_token, cacheCapable", () => {
    const p = findProvider("gemini");
    const m = findMethod(p, "models.generateContent");
    strict_1.default.equal(m.costModel, "per_token");
    strict_1.default.equal(m.cacheCapable, true);
    strict_1.default.match(m.endpoint, /generateContent$/);
});
run("mistral chat.complete → per_token with pricing", () => {
    const p = findProvider("mistral");
    const m = findMethod(p, "chat.complete");
    strict_1.default.equal(m.costModel, "per_token");
    strict_1.default.ok(typeof m.inputPricePer1M === "number");
    strict_1.default.ok(typeof m.outputPricePer1M === "number");
});
run("vertex generateContent → per_token, aiplatform endpoint", () => {
    const p = findProvider("vertex-ai");
    const m = findMethod(p, "generateContent");
    strict_1.default.equal(m.costModel, "per_token");
    strict_1.default.match(m.endpoint, /aiplatform\.googleapis\.com/);
});
run("cohere rerank → per_request", () => {
    const p = findProvider("cohere");
    const m = findMethod(p, "rerank");
    strict_1.default.equal(m.costModel, "per_request");
});
run("firebase onSnapshot → streaming", () => {
    const p = findProvider("firebase");
    const m = findMethod(p, "onSnapshot");
    strict_1.default.equal(m.streaming, true);
});
run("supabase from.select → GET, cacheCapable", () => {
    const p = findProvider("supabase");
    const m = findMethod(p, "from.select");
    strict_1.default.equal(m.httpMethod, "GET");
    strict_1.default.equal(m.cacheCapable, true);
});
// ── 5. Host patterns ──────────────────────────────────────────────────────────
run("openai hosts include api.openai.com (exact)", () => {
    const p = findProvider("openai");
    strict_1.default.ok(p.hosts.some((h) => h.pattern === "api.openai.com" && !h.isRegex));
});
run("anthropic hosts include api.anthropic.com (exact)", () => {
    const p = findProvider("anthropic");
    strict_1.default.ok(p.hosts.some((h) => h.pattern === "api.anthropic.com" && !h.isRegex));
});
run("stripe hosts include api.stripe.com (exact)", () => {
    const p = findProvider("stripe");
    strict_1.default.ok(p.hosts.some((h) => h.pattern === "api.stripe.com" && !h.isRegex));
});
run("bedrock hosts use a regex pattern", () => {
    const p = findProvider("aws-bedrock");
    strict_1.default.ok(p.hosts.some((h) => h.isRegex === true));
});
run("supabase hosts use a regex pattern covering *.supabase.co", () => {
    const p = findProvider("supabase");
    const regexHost = p.hosts.find((h) => h.isRegex);
    strict_1.default.ok(regexHost, "supabase should have a regex host pattern");
    const re = new RegExp(regexHost.pattern);
    strict_1.default.ok(re.test("myproject.supabase.co"));
    strict_1.default.ok(re.test("supabase.co"));
    strict_1.default.ok(!re.test("notsupabase.com"));
});
run("vertex hosts use a regex pattern covering *.aiplatform.googleapis.com", () => {
    const p = findProvider("vertex-ai");
    const regexHost = p.hosts.find((h) => h.isRegex);
    strict_1.default.ok(regexHost, "vertex-ai should have a regex host pattern");
    const re = new RegExp(regexHost.pattern);
    strict_1.default.ok(re.test("us-central1-aiplatform.googleapis.com"));
    strict_1.default.ok(re.test("europe-west4-aiplatform.googleapis.com"));
});
// ── 6. Pricing sanity ─────────────────────────────────────────────────────────
run("all per_token methods have inputPricePer1M defined", () => {
    for (const p of index_1.ALL_PROVIDERS) {
        for (const m of p.methods) {
            if (m.costModel === "per_token") {
                strict_1.default.ok(typeof m.inputPricePer1M === "number", `${p.provider}/${m.pattern}: per_token method missing inputPricePer1M`);
                strict_1.default.ok(m.inputPricePer1M >= 0, `${p.provider}/${m.pattern}: inputPricePer1M must be >= 0`);
            }
        }
    }
});
run("all per_transaction methods have fixedFee or percentageFee", () => {
    for (const p of index_1.ALL_PROVIDERS) {
        for (const m of p.methods) {
            if (m.costModel === "per_transaction") {
                const hasFee = typeof m.fixedFee === "number" || typeof m.percentageFee === "number";
                strict_1.default.ok(hasFee, `${p.provider}/${m.pattern}: per_transaction method must have fixedFee or percentageFee`);
            }
        }
    }
});
run("pricing values are non-negative where defined", () => {
    for (const p of index_1.ALL_PROVIDERS) {
        for (const m of p.methods) {
            if (m.inputPricePer1M !== undefined)
                strict_1.default.ok(m.inputPricePer1M >= 0, `${p.provider}/${m.pattern}: inputPricePer1M < 0`);
            if (m.outputPricePer1M !== undefined)
                strict_1.default.ok(m.outputPricePer1M >= 0, `${p.provider}/${m.pattern}: outputPricePer1M < 0`);
            if (m.fixedFee !== undefined)
                strict_1.default.ok(m.fixedFee >= 0, `${p.provider}/${m.pattern}: fixedFee < 0`);
            if (m.percentageFee !== undefined)
                strict_1.default.ok(m.percentageFee >= 0, `${p.provider}/${m.pattern}: percentageFee < 0`);
        }
    }
});
//# sourceMappingURL=fingerprint-registry.test.js.map