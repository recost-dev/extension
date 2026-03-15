"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const patterns_1 = require("../scanner/patterns");
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
function pickProvider(line, provider) {
    return (0, patterns_1.matchNormalizedLine)(line).find((m) => m.provider === provider);
}
run("keeps existing generic HTTP detection", () => {
    const matches = (0, patterns_1.matchLine)("await axios.post('/v1/foo', payload)");
    strict_1.default.ok(matches.some((m) => m.method === "POST" && m.url === "/v1/foo"));
});
run("detects openai-compatible custom baseURL host", () => {
    const line = "const client = new OpenAI({ baseURL: 'https://api.together.xyz/v1' }); await client.responses.create({ model: 'x' });";
    const match = pickProvider(line, "together");
    strict_1.default.ok(match);
    strict_1.default.equal(match?.sdk, "openai-compatible");
    strict_1.default.equal(match?.method, "POST");
    strict_1.default.match(match?.endpoint ?? "", /api\.together\.xyz\/v1\/responses/);
});
run("detects anthropic messages and batches", () => {
    const line = "await anthropic.messages.create({ model: 'claude' }); await anthropic.messageBatches.create({ requests: [] });";
    const matches = (0, patterns_1.matchNormalizedLine)(line).filter((m) => m.provider === "anthropic");
    strict_1.default.ok(matches.some((m) => m.endpoint === "https://api.anthropic.com/v1/messages"));
    strict_1.default.ok(matches.some((m) => m.endpoint === "https://api.anthropic.com/v1/messages/batches" && m.batchCapable));
});
run("detects gemini generate and file methods", () => {
    const line = "await genai.models.generateContent({}); await client.files.upload(file);";
    const matches = (0, patterns_1.matchNormalizedLine)(line).filter((m) => m.provider === "gemini");
    strict_1.default.ok(matches.some((m) => /:generateContent$/.test(m.endpoint ?? "")));
    strict_1.default.ok(matches.some((m) => /\/upload\/v1beta\/files/.test(m.endpoint ?? "")));
});
run("detects bedrock runtime commands", () => {
    const line = "await client.send(new ConverseStreamCommand({ modelId }));";
    const match = pickProvider(line, "aws-bedrock");
    strict_1.default.ok(match);
    strict_1.default.equal(match?.streaming, true);
    strict_1.default.match(match?.endpoint ?? "", /converse-stream/);
});
run("detects vertex ai SDK call", () => {
    const line = "await vertex.generateContent({ model: 'gemini-2.0-pro' });";
    const match = pickProvider(line, "vertex-ai");
    strict_1.default.ok(match);
    strict_1.default.match(match?.endpoint ?? "", /aiplatform\.googleapis\.com/);
});
run("detects graphql fetch and operation name", () => {
    const line = "fetch('/graphql', { method: 'POST', body: JSON.stringify({ query: 'query GetUsers { users { id } }', variables }) });";
    const match = (0, patterns_1.matchNormalizedLine)(line).find((m) => m.kind === "graphql");
    strict_1.default.ok(match);
    strict_1.default.equal(match?.action, "query");
    strict_1.default.equal(match?.operationName, "GetUsers");
});
run("detects supabase CRUD and firebase listeners", () => {
    const line = "await supabase.from('todos').select('*'); onSnapshot(ref, () => {});";
    const matches = (0, patterns_1.matchNormalizedLine)(line);
    strict_1.default.ok(matches.some((m) => m.provider === "supabase" && m.action === "select"));
    strict_1.default.ok(matches.some((m) => m.provider === "firebase" && m.streaming));
});
run("detects cohere and mistral", () => {
    const line = "await cohere.embed({}); await mistral.chat.stream({});";
    const matches = (0, patterns_1.matchNormalizedLine)(line);
    strict_1.default.ok(matches.some((m) => m.provider === "cohere" && m.action === "embed"));
    strict_1.default.ok(matches.some((m) => m.provider === "mistral" && m.streaming));
});
run("detects stripe create calls", () => {
    const line = "await stripe.paymentIntents.create({ amount: 10, currency: 'usd' });";
    const match = pickProvider(line, "stripe");
    strict_1.default.ok(match);
    strict_1.default.equal(match?.method, "POST");
});
run("detects trpc and grpc patterns", () => {
    const line = "await trpc.user.profile.query({ id }); const c = new GreeterClient(addr); c.SayHello(request);";
    const matches = (0, patterns_1.matchNormalizedLine)(line);
    strict_1.default.ok(matches.some((m) => m.provider === "trpc" && m.action === "query"));
    strict_1.default.ok(matches.some((m) => m.provider === "grpc"));
});
run("keeps route definition detection", () => {
    const routes = (0, patterns_1.matchRouteDefinitionLine)("router.post('/webhook/stripe', handler)");
    strict_1.default.ok(routes.some((r) => r.method === "POST" && r.url === "/webhook/stripe"));
});
console.log("All scanner matcher tests passed");
//# sourceMappingURL=scanner-patterns.test.js.map