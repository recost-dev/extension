import assert from "node:assert/strict";
import { classifyEndpointScope, detectEndpointProvider } from "../scanner/endpoint-classification";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("relative routes are internal", () => {
  assert.equal(classifyEndpointScope("/weather"), "internal");
  assert.equal(classifyEndpointScope("/news"), "internal");
  assert.equal(classifyEndpointScope("/all"), "internal");
});

test("localhost variants are internal", () => {
  assert.equal(classifyEndpointScope("http://localhost:3000/api"), "internal");
  assert.equal(classifyEndpointScope("http://127.0.0.1:8000/v1"), "internal");
  assert.equal(classifyEndpointScope("http://0.0.0.0:5000/health"), "internal");
  assert.equal(classifyEndpointScope("http://[::1]:8080/status"), "internal");
  assert.equal(classifyEndpointScope("http://foo.local/path"), "internal");
  assert.equal(classifyEndpointScope("https://svc.internal/v1"), "internal");
});

test("public absolute URLs are external", () => {
  assert.equal(classifyEndpointScope("https://api.openai.com/v1/chat/completions"), "external");
  assert.equal(classifyEndpointScope("https://api.stripe.com/v1/payment_intents"), "external");
  assert.equal(classifyEndpointScope("https://api.github.com/repos/openai/openai-python"), "external");
  assert.equal(classifyEndpointScope("https://wttr.in/Indianapolis?format=3"), "external");
  assert.equal(classifyEndpointScope("https://hacker-news.firebaseio.com/v0/topstories.json"), "external");
  assert.equal(classifyEndpointScope("http://ip-api.com/json"), "external");
});

test("provider mapping preserves known hosts", () => {
  assert.equal(detectEndpointProvider("https://api.openai.com/v1/chat/completions"), "openai");
  assert.equal(detectEndpointProvider("https://api.stripe.com/v1/customers"), "stripe");
  assert.equal(detectEndpointProvider("https://api.github.com/user"), "github");
  assert.equal(detectEndpointProvider("https://api.coingecko.com/api/v3/ping"), "coingecko");
  assert.equal(detectEndpointProvider("https://newsdata.io/api/1/news"), "newsdata");
  assert.equal(detectEndpointProvider("https://hacker-news.firebaseio.com/v0/item/1.json"), "hacker-news");
  assert.equal(detectEndpointProvider("https://wttr.in/?format=3"), "weather");
  assert.equal(detectEndpointProvider("https://zenquotes.io/api/random"), "quotes");
  assert.equal(detectEndpointProvider("http://ip-api.com/json"), "geo");
});

test("dynamic or unresolved host cases are unknown scope", () => {
  assert.equal(classifyEndpointScope("<dynamic:baseUrl>"), "unknown");
  assert.equal(classifyEndpointScope("https://${API_HOST}/v1"), "unknown");
  assert.equal(classifyEndpointScope("https://"), "unknown");
});
