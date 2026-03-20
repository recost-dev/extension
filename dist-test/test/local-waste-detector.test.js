"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const local_waste_detector_1 = require("../scanner/local-waste-detector");
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
run("detects n+1 and concurrency fanout in route handlers", () => {
    const text = [
        "router.get('/users', async (req, res) => {",
        "  await Promise.all(userIds.map((id) => client.responses.create({ model: 'gpt-4.1-mini', input: id })));",
        "});",
    ].join("\n");
    const findings = (0, local_waste_detector_1.detectLocalWasteFindingsInText)("src/routes/users.ts", text);
    strict_1.default.ok(findings.some((finding) => finding.type === "n_plus_one" && finding.severity === "high"));
    strict_1.default.ok(findings.some((finding) => finding.type === "concurrency_control" && finding.confidence >= 0.7));
});
run("suppresses cache finding when query client caching is nearby", () => {
    const text = [
        "useEffect(() => {",
        "  queryClient.fetchQuery(['user', id], () => fetch(`/api/users/${id}`));",
        "}, [id]);",
    ].join("\n");
    const findings = (0, local_waste_detector_1.detectLocalWasteFindingsInText)("src/app/profile.tsx", text);
    strict_1.default.ok(!findings.some((finding) => finding.type === "cache"));
});
run("detects repeated config and auth lookup redundancy", () => {
    const text = [
        "router.get('/profile', async (req, res) => {",
        "  const session = await auth.getSession();",
        "  const config = getConfig();",
        "  await fetch('https://api.example.com/profile');",
        "});",
    ].join("\n");
    const findings = (0, local_waste_detector_1.detectLocalWasteFindingsInText)("src/routes/profile.ts", text);
    const redundancy = findings.find((finding) => finding.type === "redundancy");
    strict_1.default.ok(redundancy);
    strict_1.default.ok((redundancy?.evidence ?? []).some((item) => /Auth\/session\/config/.test(item)));
});
run("reduces confidence when polling already has backoff and concurrency guards", () => {
    const text = [
        "setInterval(async () => {",
        "  await limit(() => client.responses.create({ model: 'gpt-4.1-mini', input: 'ping' }));",
        "  await sleep(backoffMs);",
        "}, 1000);",
    ].join("\n");
    const findings = (0, local_waste_detector_1.detectLocalWasteFindingsInText)("src/workers/poller.ts", text);
    const rateLimit = findings.find((finding) => finding.type === "rate_limit");
    strict_1.default.ok(rateLimit);
    strict_1.default.ok((rateLimit?.confidence ?? 1) < 0.75);
});
console.log("All local waste detector tests passed");
//# sourceMappingURL=local-waste-detector.test.js.map