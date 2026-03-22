/**
 * Tests for syncPricingFromBackend() in fingerprints/registry.ts.
 *
 * All tests use a mocked global fetch — the real API is never contacted.
 */
import assert from "node:assert/strict";
import {
  lookupMethod,
  syncPricingFromBackend,
} from "../scanner/fingerprints/registry";
import type { MethodFingerprint } from "../scanner/fingerprints/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

type PricingSnapshot = {
  costModel: MethodFingerprint["costModel"];
  inputPricePer1M: number | undefined;
  outputPricePer1M: number | undefined;
  fixedFee: number | undefined;
  percentageFee: number | undefined;
  perRequestCostUsd: number | undefined;
};

function snapshotPricing(m: MethodFingerprint): PricingSnapshot {
  return {
    costModel: m.costModel,
    inputPricePer1M: m.inputPricePer1M,
    outputPricePer1M: m.outputPricePer1M,
    fixedFee: m.fixedFee,
    percentageFee: m.percentageFee,
    perRequestCostUsd: m.perRequestCostUsd,
  };
}

function snapshotDetection(m: MethodFingerprint) {
  return {
    pattern: m.pattern,
    httpMethod: m.httpMethod,
    endpoint: m.endpoint,
    streaming: m.streaming,
    batchCapable: m.batchCapable,
    cacheCapable: m.cacheCapable,
    description: m.description,
  };
}

function restorePricing(m: MethodFingerprint, saved: PricingSnapshot) {
  m.costModel = saved.costModel;
  if (saved.inputPricePer1M !== undefined) {
    m.inputPricePer1M = saved.inputPricePer1M;
  } else {
    delete m.inputPricePer1M;
  }
  if (saved.outputPricePer1M !== undefined) {
    m.outputPricePer1M = saved.outputPricePer1M;
  } else {
    delete m.outputPricePer1M;
  }
  if (saved.fixedFee !== undefined) {
    m.fixedFee = saved.fixedFee;
  } else {
    delete m.fixedFee;
  }
  if (saved.percentageFee !== undefined) {
    m.percentageFee = saved.percentageFee;
  } else {
    delete m.percentageFee;
  }
  if (saved.perRequestCostUsd !== undefined) {
    m.perRequestCostUsd = saved.perRequestCostUsd;
  } else {
    delete m.perRequestCostUsd;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FetchImpl = (input: any, init?: any) => Promise<any>;

function mockFetch(impl: FetchImpl): () => void {
  const original = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).fetch = impl;
  return () => {
    (globalThis as Record<string, unknown>).fetch = original;
  };
}

function makeFetchOk(body: unknown): FetchImpl {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
}

function makeFetchStatus(status: number): FetchImpl {
  return () =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.reject(new Error("not json")),
    } as Response);
}

function makeFetchNetworkError(message = "network error"): FetchImpl {
  return () => Promise.reject(new Error(message));
}

function makeFetchMalformedJson(): FetchImpl {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as Response);
}

function makeFetchTimeout(): FetchImpl {
  return (_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException("AbortError", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("AbortError", "AbortError"));
        });
      }
      // Never resolves on its own — waits for the abort signal
    });
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  await run("successful sync: pricing fields are updated in registry", async () => {
    const method = lookupMethod("openai", "chat.completions.create")!;
    assert.ok(method, "openai chat.completions.create must exist");
    const saved = snapshotPricing(method);

    const restore = mockFetch(
      makeFetchOk({
        schemaVersion: "1.0.0",
        updatedAt: "2026-03-22T00:00:00Z",
        providers: {
          openai: {
            methods: {
              "chat.completions.create": {
                costModel: "per_token",
                inputPricePer1M: 0.999,
                outputPricePer1M: 3.999,
              },
            },
          },
        },
      })
    );

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      assert.equal(method.inputPricePer1M, 0.999, "inputPricePer1M must be updated");
      assert.equal(method.outputPricePer1M, 3.999, "outputPricePer1M must be updated");
      assert.equal(method.costModel, "per_token", "costModel must be updated");
    } finally {
      restore();
      restorePricing(method, saved);
    }
  });

  await run("partial response: only returned provider updated, others unchanged", async () => {
    const openaiMethod = lookupMethod("openai", "chat.completions.create")!;
    const anthropicMethod = lookupMethod("anthropic", "messages.create")!;
    assert.ok(openaiMethod && anthropicMethod);

    const savedOpenai = snapshotPricing(openaiMethod);
    const savedAnthropic = snapshotPricing(anthropicMethod);

    const restore = mockFetch(
      makeFetchOk({
        schemaVersion: "1.0.0",
        providers: {
          openai: {
            methods: {
              "chat.completions.create": {
                costModel: "per_token",
                inputPricePer1M: 1.23,
                outputPricePer1M: 4.56,
              },
            },
          },
          // anthropic is absent from the response
        },
      })
    );

    try {
      await syncPricingFromBackend("https://api.recost.dev");

      // OpenAI was in the response — must be updated
      assert.equal(openaiMethod.inputPricePer1M, 1.23, "openai must be updated");

      // Anthropic was not in the response — must be unchanged
      assert.equal(
        anthropicMethod.inputPricePer1M,
        savedAnthropic.inputPricePer1M,
        "anthropic inputPricePer1M must be unchanged"
      );
      assert.equal(
        anthropicMethod.outputPricePer1M,
        savedAnthropic.outputPricePer1M,
        "anthropic outputPricePer1M must be unchanged"
      );
    } finally {
      restore();
      restorePricing(openaiMethod, savedOpenai);
      restorePricing(anthropicMethod, savedAnthropic);
    }
  });

  await run("unknown method in response: skipped, bundled registry unchanged", async () => {
    const method = lookupMethod("openai", "chat.completions.create")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(
      makeFetchOk({
        schemaVersion: "1.0.0",
        providers: {
          openai: {
            methods: {
              "nonexistent.totally.fake.method": {
                costModel: "per_token",
                inputPricePer1M: 99999,
              },
            },
          },
        },
      })
    );

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      // The real method must be untouched
      assert.equal(
        method.inputPricePer1M,
        saved.inputPricePer1M,
        "bundled method must not be touched"
      );
    } finally {
      restore();
    }
  });

  await run("timeout: bundled pricing is unchanged", async () => {
    const method = lookupMethod("anthropic", "messages.create")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(makeFetchTimeout());

    try {
      // syncPricingFromBackend has a 3-second timeout; should resolve after abort
      await syncPricingFromBackend("https://api.recost.dev");

      assert.equal(
        method.inputPricePer1M,
        saved.inputPricePer1M,
        "inputPricePer1M must be unchanged after timeout"
      );
      assert.equal(
        method.outputPricePer1M,
        saved.outputPricePer1M,
        "outputPricePer1M must be unchanged after timeout"
      );
    } finally {
      restore();
    }
  });

  await run("HTTP 500: bundled pricing is unchanged", async () => {
    const method = lookupMethod("stripe", "paymentIntents.create")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(makeFetchStatus(500));

    try {
      await syncPricingFromBackend("https://api.recost.dev");

      assert.equal(method.fixedFee, saved.fixedFee, "fixedFee must be unchanged after 500");
      assert.equal(
        method.percentageFee,
        saved.percentageFee,
        "percentageFee must be unchanged after 500"
      );
    } finally {
      restore();
    }
  });

  await run("HTTP 404: bundled pricing is unchanged", async () => {
    const method = lookupMethod("openai", "embeddings.create")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(makeFetchStatus(404));

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      assert.equal(
        method.inputPricePer1M,
        saved.inputPricePer1M,
        "pricing must be unchanged after 404"
      );
    } finally {
      restore();
    }
  });

  await run("malformed JSON: bundled pricing is unchanged", async () => {
    const method = lookupMethod("gemini", "models.generateContent")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(makeFetchMalformedJson());

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      assert.equal(
        method.inputPricePer1M,
        saved.inputPricePer1M,
        "pricing must be unchanged after malformed JSON"
      );
    } finally {
      restore();
    }
  });

  await run("malformed response (missing providers key): bundled pricing unchanged", async () => {
    const method = lookupMethod("mistral", "chat.complete")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(makeFetchOk({ schemaVersion: "1.0.0" /* no providers */ }));

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      assert.equal(
        method.inputPricePer1M,
        saved.inputPricePer1M,
        "pricing must be unchanged after malformed response"
      );
    } finally {
      restore();
    }
  });

  await run("network error: bundled pricing is unchanged", async () => {
    const method = lookupMethod("anthropic", "messages.stream")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(makeFetchNetworkError("ECONNREFUSED"));

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      assert.equal(
        method.inputPricePer1M,
        saved.inputPricePer1M,
        "pricing must be unchanged after network error"
      );
    } finally {
      restore();
      restorePricing(method, saved);
    }
  });

  await run("detection fields are never overwritten even if API returns them", async () => {
    const method = lookupMethod("openai", "chat.completions.create")!;
    assert.ok(method);
    const savedDetection = snapshotDetection(method);
    const savedPricing = snapshotPricing(method);

    const restore = mockFetch(
      makeFetchOk({
        schemaVersion: "1.0.0",
        providers: {
          openai: {
            methods: {
              "chat.completions.create": {
                // Pricing fields — OK to overwrite
                costModel: "per_token",
                inputPricePer1M: 0.777,
                outputPricePer1M: 2.888,
                // Detection fields — must be ignored even if present in response
                pattern: "INJECTED_PATTERN",
                httpMethod: "DELETE",
                endpoint: "https://evil.example.com/inject",
                streaming: true,
                batchCapable: false,
                cacheCapable: false,
                description: "INJECTED_DESCRIPTION",
              },
            },
          },
        },
      })
    );

    try {
      await syncPricingFromBackend("https://api.recost.dev");

      // Pricing must be updated
      assert.equal(method.inputPricePer1M, 0.777, "inputPricePer1M must be updated");

      // Detection fields must be unchanged
      assert.equal(method.pattern, savedDetection.pattern, "pattern must not change");
      assert.equal(method.httpMethod, savedDetection.httpMethod, "httpMethod must not change");
      assert.equal(method.endpoint, savedDetection.endpoint, "endpoint must not change");
      assert.equal(method.streaming, savedDetection.streaming, "streaming must not change");
      assert.equal(method.batchCapable, savedDetection.batchCapable, "batchCapable must not change");
      assert.equal(method.cacheCapable, savedDetection.cacheCapable, "cacheCapable must not change");
      assert.equal(method.description, savedDetection.description, "description must not change");
    } finally {
      restore();
      restorePricing(method, savedPricing);
    }
  });

  await run("perRequestCostUsd is synced when present in response", async () => {
    const method = lookupMethod("cohere", "rerank")!;
    assert.ok(method);
    const saved = snapshotPricing(method);

    const restore = mockFetch(
      makeFetchOk({
        schemaVersion: "1.0.0",
        providers: {
          cohere: {
            methods: {
              rerank: {
                costModel: "per_request",
                perRequestCostUsd: 0.001,
              },
            },
          },
        },
      })
    );

    try {
      await syncPricingFromBackend("https://api.recost.dev");
      assert.equal(method.perRequestCostUsd, 0.001, "perRequestCostUsd must be synced");
      assert.equal(method.costModel, "per_request", "costModel must be updated");
    } finally {
      restore();
      restorePricing(method, saved);
    }
  });
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
