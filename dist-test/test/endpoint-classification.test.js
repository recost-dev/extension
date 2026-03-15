"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const endpoint_classification_1 = require("../scanner/endpoint-classification");
function test(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    }
    catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}
test("relative routes are internal", () => {
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("/weather"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("/news"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("/all"), "internal");
});
test("localhost variants are internal", () => {
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("http://localhost:3000/api"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("http://127.0.0.1:8000/v1"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("http://0.0.0.0:5000/health"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("http://[::1]:8080/status"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("http://foo.local/path"), "internal");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://svc.internal/v1"), "internal");
});
test("public absolute URLs are external", () => {
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://api.openai.com/v1/chat/completions"), "external");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://api.stripe.com/v1/payment_intents"), "external");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://api.github.com/repos/openai/openai-python"), "external");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://wttr.in/Indianapolis?format=3"), "external");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://hacker-news.firebaseio.com/v0/topstories.json"), "external");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("http://ip-api.com/json"), "external");
});
test("provider mapping preserves known hosts", () => {
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://api.openai.com/v1/chat/completions"), "openai");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://api.stripe.com/v1/customers"), "stripe");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://api.github.com/user"), "github");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://api.coingecko.com/api/v3/ping"), "coingecko");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://newsdata.io/api/1/news"), "newsdata");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://hacker-news.firebaseio.com/v0/item/1.json"), "hacker-news");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://wttr.in/?format=3"), "weather");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("https://zenquotes.io/api/random"), "quotes");
    strict_1.default.equal((0, endpoint_classification_1.detectEndpointProvider)("http://ip-api.com/json"), "geo");
});
test("dynamic or unresolved host cases are unknown scope", () => {
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("<dynamic:baseUrl>"), "unknown");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://${API_HOST}/v1"), "unknown");
    strict_1.default.equal((0, endpoint_classification_1.classifyEndpointScope)("https://"), "unknown");
});
//# sourceMappingURL=endpoint-classification.test.js.map