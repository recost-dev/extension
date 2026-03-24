import type { RepoIntelligenceSnapshot } from "../types";

// =============================================================
// Shared mock dataset for RepoIntelligenceSnapshot.
// Used across unit tests, storybooks, and local dev tooling.
// Do NOT use in production paths.
// =============================================================

export const mockSnapshot: RepoIntelligenceSnapshot = {
  createdAt: "2026-03-24T10:00:00.000Z",
  repoRoot: "/home/user/projects/my-saas",
  totalFilesScanned: 5,

  // -------------------------------------------------------
  // FILES
  // -------------------------------------------------------
  files: {
    "src/gateway/chat.ts": {
      id: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      lineCount: 142,
      functionIds: [
        "src/gateway/chat.ts::handleChatCompletion",
        "src/gateway/chat.ts::streamResponse",
        "src/gateway/chat.ts::generateEmbedding",
      ],
      apiCallIds: [
        "src/gateway/chat.ts:18:openai-chat-completions",
        "src/gateway/chat.ts:47:anthropic-messages",
        "src/gateway/chat.ts:72:openai-embeddings",
        "src/gateway/chat.ts:98:openai-chat-completions-stream",
        "src/gateway/chat.ts:115:openai-embeddings-batch",
      ],
      findingIds: ["finding-0001", "finding-0002", "finding-0003"],
      imports: ["src/utils/cache.ts", "src/config/env.ts"],
      importedBy: [],
      providers: ["openai", "anthropic"],
    },

    "src/gateway/image.ts": {
      id: "src/gateway/image.ts",
      filePath: "src/gateway/image.ts",
      lineCount: 88,
      functionIds: [
        "src/gateway/image.ts::generateImage",
        "src/gateway/image.ts::analyzeImage",
      ],
      apiCallIds: [
        "src/gateway/image.ts:22:openai-images-generations",
        "src/gateway/image.ts:55:anthropic-messages-vision",
      ],
      findingIds: ["finding-0004"],
      imports: ["src/utils/cache.ts", "src/config/env.ts"],
      importedBy: [],
      providers: ["openai", "anthropic"],
    },

    "src/billing/stripe.ts": {
      id: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      lineCount: 110,
      functionIds: [
        "src/billing/stripe.ts::createPaymentIntent",
        "src/billing/stripe.ts::listCustomers",
        "src/billing/stripe.ts::chargeCard",
      ],
      apiCallIds: [
        "src/billing/stripe.ts:31:stripe-payment-intents-create",
        "src/billing/stripe.ts:58:stripe-customers-list",
        "src/billing/stripe.ts:84:stripe-charges-create",
      ],
      findingIds: ["finding-0005", "finding-0006"],
      imports: ["src/config/env.ts"],
      importedBy: [],
      providers: ["stripe"],
    },

    "src/utils/cache.ts": {
      id: "src/utils/cache.ts",
      filePath: "src/utils/cache.ts",
      lineCount: 54,
      functionIds: [],
      apiCallIds: [],
      findingIds: [],
      imports: [],
      importedBy: ["src/gateway/chat.ts", "src/gateway/image.ts"],
      providers: [],
    },

    "src/config/env.ts": {
      id: "src/config/env.ts",
      filePath: "src/config/env.ts",
      lineCount: 28,
      functionIds: [],
      apiCallIds: [],
      findingIds: [],
      imports: [],
      importedBy: [
        "src/gateway/chat.ts",
        "src/gateway/image.ts",
        "src/billing/stripe.ts",
      ],
      providers: [],
    },
  },

  // -------------------------------------------------------
  // FUNCTIONS (8 total)
  // -------------------------------------------------------
  functions: {
    "src/gateway/chat.ts::handleChatCompletion": {
      id: "src/gateway/chat.ts::handleChatCompletion",
      name: "handleChatCompletion",
      fileId: "src/gateway/chat.ts",
      startLine: 12,
      endLine: 55,
      apiCallIds: [
        "src/gateway/chat.ts:18:openai-chat-completions",
        "src/gateway/chat.ts:47:anthropic-messages",
      ],
      findingIds: ["finding-0002", "finding-0003"],
      isExported: true,
      isAsync: true,
    },

    "src/gateway/chat.ts::streamResponse": {
      id: "src/gateway/chat.ts::streamResponse",
      name: "streamResponse",
      fileId: "src/gateway/chat.ts",
      startLine: 58,
      endLine: 105,
      apiCallIds: ["src/gateway/chat.ts:98:openai-chat-completions-stream"],
      findingIds: [],
      isExported: true,
      isAsync: true,
    },

    "src/gateway/chat.ts::generateEmbedding": {
      id: "src/gateway/chat.ts::generateEmbedding",
      name: "generateEmbedding",
      fileId: "src/gateway/chat.ts",
      startLine: 108,
      endLine: 142,
      apiCallIds: [
        "src/gateway/chat.ts:72:openai-embeddings",
        "src/gateway/chat.ts:115:openai-embeddings-batch",
      ],
      findingIds: ["finding-0001"],
      isExported: true,
      isAsync: true,
    },

    "src/gateway/image.ts::generateImage": {
      id: "src/gateway/image.ts::generateImage",
      name: "generateImage",
      fileId: "src/gateway/image.ts",
      startLine: 15,
      endLine: 48,
      apiCallIds: ["src/gateway/image.ts:22:openai-images-generations"],
      findingIds: ["finding-0004"],
      isExported: true,
      isAsync: true,
    },

    "src/gateway/image.ts::analyzeImage": {
      id: "src/gateway/image.ts::analyzeImage",
      name: "analyzeImage",
      fileId: "src/gateway/image.ts",
      startLine: 51,
      endLine: 88,
      apiCallIds: ["src/gateway/image.ts:55:anthropic-messages-vision"],
      findingIds: [],
      isExported: true,
      isAsync: true,
    },

    "src/billing/stripe.ts::createPaymentIntent": {
      id: "src/billing/stripe.ts::createPaymentIntent",
      name: "createPaymentIntent",
      fileId: "src/billing/stripe.ts",
      startLine: 24,
      endLine: 48,
      apiCallIds: ["src/billing/stripe.ts:31:stripe-payment-intents-create"],
      findingIds: ["finding-0006"],
      isExported: true,
      isAsync: true,
    },

    "src/billing/stripe.ts::listCustomers": {
      id: "src/billing/stripe.ts::listCustomers",
      name: "listCustomers",
      fileId: "src/billing/stripe.ts",
      startLine: 51,
      endLine: 72,
      apiCallIds: ["src/billing/stripe.ts:58:stripe-customers-list"],
      findingIds: ["finding-0005"],
      isExported: true,
      isAsync: true,
    },

    "src/billing/stripe.ts::chargeCard": {
      id: "src/billing/stripe.ts::chargeCard",
      name: "chargeCard",
      fileId: "src/billing/stripe.ts",
      startLine: 75,
      endLine: 110,
      apiCallIds: ["src/billing/stripe.ts:84:stripe-charges-create"],
      findingIds: [],
      isExported: true,
      isAsync: true,
    },
  },

  // -------------------------------------------------------
  // API CALLS (10 total — openai×5, stripe×3, anthropic×2)
  // -------------------------------------------------------
  apiCalls: {
    // --- openai ---
    "src/gateway/chat.ts:18:openai-chat-completions": {
      id: "src/gateway/chat.ts:18:openai-chat-completions",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::handleChatCompletion",
      line: 18,
      column: 20,
      provider: "openai",
      endpoint: "chat-completions",
      estimatedCostPerCall: 0.002,
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: true,
        inRetry: false,
        hasCacheCheck: false, // no cache guard — finding-0002
        estimatedCallsPerMonth: 50000,
      },
    },

    "src/gateway/chat.ts:72:openai-embeddings": {
      id: "src/gateway/chat.ts:72:openai-embeddings",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::generateEmbedding",
      line: 72,
      column: 16,
      provider: "openai",
      endpoint: "embeddings",
      estimatedCostPerCall: 0.0001,
      method: "POST",
      context: {
        inLoop: true, // called per-item inside a loop — finding-0001
        inTryCatch: false,
        inRetry: false,
        hasCacheCheck: false,
        estimatedCallsPerMonth: 200000,
      },
    },

    "src/gateway/chat.ts:98:openai-chat-completions-stream": {
      id: "src/gateway/chat.ts:98:openai-chat-completions-stream",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::streamResponse",
      line: 98,
      column: 22,
      provider: "openai",
      endpoint: "chat-completions",
      estimatedCostPerCall: 0.002,
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: true,
        inRetry: false,
        hasCacheCheck: true,
        estimatedCallsPerMonth: 30000,
      },
    },

    "src/gateway/image.ts:22:openai-images-generations": {
      id: "src/gateway/image.ts:22:openai-images-generations",
      fileId: "src/gateway/image.ts",
      functionId: "src/gateway/image.ts::generateImage",
      line: 22,
      column: 18,
      provider: "openai",
      endpoint: "images-generations",
      estimatedCostPerCall: 0.02,
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: false,
        inRetry: false,
        hasCacheCheck: false, // no cache guard
        estimatedCallsPerMonth: 10000,
      },
    },

    // openai call #5 — reuse of embeddings endpoint from a different context
    "src/gateway/image.ts:55:anthropic-messages-vision": {
      id: "src/gateway/image.ts:55:anthropic-messages-vision",
      fileId: "src/gateway/image.ts",
      functionId: "src/gateway/image.ts::analyzeImage",
      line: 55,
      column: 20,
      provider: "anthropic",
      endpoint: "messages",
      estimatedCostPerCall: 0.003,
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: true,
        inRetry: false,
        hasCacheCheck: true,
        estimatedCallsPerMonth: 8000,
      },
    },

    // --- anthropic ---
    "src/gateway/chat.ts:47:anthropic-messages": {
      id: "src/gateway/chat.ts:47:anthropic-messages",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::handleChatCompletion",
      line: 47,
      column: 20,
      provider: "anthropic",
      endpoint: "messages",
      estimatedCostPerCall: 0.003,
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: false,
        inRetry: false,
        hasCacheCheck: false, // no retry, no cache — finding-0003
        estimatedCallsPerMonth: 20000,
      },
    },

    // --- stripe ---
    "src/billing/stripe.ts:31:stripe-payment-intents-create": {
      id: "src/billing/stripe.ts:31:stripe-payment-intents-create",
      fileId: "src/billing/stripe.ts",
      functionId: "src/billing/stripe.ts::createPaymentIntent",
      line: 31,
      column: 14,
      provider: "stripe",
      endpoint: "payment-intents-create",
      estimatedCostPerCall: null, // Stripe pricing is % of transaction
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: true,
        inRetry: false,
        hasCacheCheck: false,
        estimatedCallsPerMonth: 5000,
      },
    },

    "src/billing/stripe.ts:58:stripe-customers-list": {
      id: "src/billing/stripe.ts:58:stripe-customers-list",
      fileId: "src/billing/stripe.ts",
      functionId: "src/billing/stripe.ts::listCustomers",
      line: 58,
      column: 16,
      provider: "stripe",
      endpoint: "customers-list",
      estimatedCostPerCall: null,
      method: "GET",
      context: {
        inLoop: true, // paginating inside a loop — finding-0005
        inTryCatch: false,
        inRetry: false,
        hasCacheCheck: false,
        estimatedCallsPerMonth: 15000,
      },
    },

    "src/billing/stripe.ts:84:stripe-charges-create": {
      id: "src/billing/stripe.ts:84:stripe-charges-create",
      fileId: "src/billing/stripe.ts",
      functionId: "src/billing/stripe.ts::chargeCard",
      line: 84,
      column: 14,
      provider: "stripe",
      endpoint: "charges-create",
      estimatedCostPerCall: null,
      method: "POST",
      context: {
        inLoop: false,
        inTryCatch: true,
        inRetry: false,
        hasCacheCheck: false,
        estimatedCallsPerMonth: 4000,
      },
    },

    // 10th call — an extra openai embeddings call (batch scenario)
    "src/gateway/chat.ts:115:openai-embeddings-batch": {
      id: "src/gateway/chat.ts:115:openai-embeddings-batch",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::generateEmbedding",
      line: 115,
      column: 16,
      provider: "openai",
      endpoint: "embeddings",
      estimatedCostPerCall: 0.0001,
      method: "POST",
      context: {
        inLoop: true,
        inTryCatch: false,
        inRetry: false,
        hasCacheCheck: false,
        estimatedCallsPerMonth: 180000,
      },
    },
  },

  // -------------------------------------------------------
  // FINDINGS (6 total: 2 critical, 2 high, 1 medium, 1 low)
  // -------------------------------------------------------
  findings: {
    // CRITICAL — openai embeddings called per-item in a loop
    "finding-0001": {
      id: "finding-0001",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::generateEmbedding",
      apiCallId: "src/gateway/chat.ts:72:openai-embeddings",
      detector: "loop-detector",
      title: "Embeddings called per-item inside a loop",
      description:
        "openai/embeddings is called individually for each item inside a for loop. This creates an N+1 API call pattern that scales linearly with input size, resulting in high latency and cost.",
      severity: "critical",
      confidence: 0.95,
      line: 72,
      endLine: 74,
      evidence: "for (const doc of documents) {\n  await openai.embeddings.create({ input: doc });\n}",
      suggestion:
        "Batch all inputs into a single openai.embeddings.create call by passing an array: openai.embeddings.create({ input: documents }). This reduces N round-trips to 1.",
      estimatedMonthlyCost: 120.0,
    },

    // CRITICAL — stripe customers listed in a loop (N+1 pagination)
    "finding-0005": {
      id: "finding-0005",
      fileId: "src/billing/stripe.ts",
      functionId: "src/billing/stripe.ts::listCustomers",
      apiCallId: "src/billing/stripe.ts:58:stripe-customers-list",
      detector: "loop-detector",
      title: "Stripe customers.list called inside a loop",
      description:
        "stripe.customers.list is called on each iteration of a loop. Each call fetches a fresh page without cursor reuse, causing redundant API requests that slow down billing operations.",
      severity: "critical",
      confidence: 0.92,
      line: 58,
      endLine: 63,
      evidence: "for (const batch of batches) {\n  const customers = await stripe.customers.list({ limit: 100 });\n}",
      suggestion:
        "Collect all relevant customer IDs upfront and use a single paginated iteration with stripe.customers.list({ limit: 100 }) outside the loop, or use stripe.customers.search for filtered queries.",
      estimatedMonthlyCost: null,
    },

    // HIGH — missing cache guard on chat completions
    "finding-0002": {
      id: "finding-0002",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::handleChatCompletion",
      apiCallId: "src/gateway/chat.ts:18:openai-chat-completions",
      detector: "cache-detector",
      title: "No cache check before openai/chat-completions",
      description:
        "The chat completions endpoint is called on every request without checking a cache. Repeated prompts with identical inputs will incur full token costs each time.",
      severity: "high",
      confidence: 0.85,
      line: 18,
      endLine: 25,
      evidence: "const response = await openai.chat.completions.create({ model, messages });",
      suggestion:
        "Add a deterministic cache key (e.g. SHA-256 of model + messages) and check a Redis or in-memory cache before calling the API. Cache responses for at least 5 minutes for repeated identical prompts.",
      estimatedMonthlyCost: 45.0,
    },

    // HIGH — no error handling on image generation
    "finding-0004": {
      id: "finding-0004",
      fileId: "src/gateway/image.ts",
      functionId: "src/gateway/image.ts::generateImage",
      apiCallId: "src/gateway/image.ts:22:openai-images-generations",
      detector: "reliability-detector",
      title: "No try/catch around openai/images-generations",
      description:
        "Image generation calls are not wrapped in error handling. A content policy rejection or rate-limit error from OpenAI will propagate as an unhandled exception, crashing the request handler.",
      severity: "high",
      confidence: 0.9,
      line: 22,
      endLine: 28,
      evidence: "const image = await openai.images.generate({ model: 'dall-e-3', prompt });",
      suggestion:
        "Wrap the call in a try/catch block. Handle OpenAI error codes 400 (content policy) and 429 (rate limit) with appropriate user-facing messages and exponential backoff respectively.",
      estimatedMonthlyCost: null,
    },

    // MEDIUM — anthropic fallback without retry
    "finding-0003": {
      id: "finding-0003",
      fileId: "src/gateway/chat.ts",
      functionId: "src/gateway/chat.ts::handleChatCompletion",
      apiCallId: "src/gateway/chat.ts:47:anthropic-messages",
      detector: "reliability-detector",
      title: "Anthropic fallback call lacks retry logic",
      description:
        "The Anthropic messages call used as a fallback has no retry wrapper. Transient 529 (overloaded) errors will immediately bubble up rather than being retried with backoff.",
      severity: "medium",
      confidence: 0.78,
      line: 47,
      endLine: 52,
      evidence: "const fallback = await anthropic.messages.create({ model, messages });",
      suggestion:
        "Wrap the Anthropic call with exponential backoff (e.g. p-retry or a simple loop). Retry on status 529 and 503 up to 3 times with jitter before propagating the error.",
      estimatedMonthlyCost: null,
    },

    // LOW — missing idempotency key on payment intent
    "finding-0006": {
      id: "finding-0006",
      fileId: "src/billing/stripe.ts",
      functionId: "src/billing/stripe.ts::createPaymentIntent",
      apiCallId: "src/billing/stripe.ts:31:stripe-payment-intents-create",
      detector: "reliability-detector",
      title: "PaymentIntent created without idempotency key",
      description:
        "stripe.paymentIntents.create is called without an idempotency key. A network retry after a timeout could create duplicate charges if the original request already succeeded on Stripe's end.",
      severity: "low",
      confidence: 0.7,
      line: 31,
      endLine: 36,
      evidence: "await stripe.paymentIntents.create({ amount, currency, customer });",
      suggestion:
        "Pass an idempotencyKey option derived from a stable request identifier (e.g. orderId): stripe.paymentIntents.create({ ... }, { idempotencyKey: orderId }). This makes the call safe to retry.",
      estimatedMonthlyCost: null,
    },
  },

  // -------------------------------------------------------
  // PROVIDERS (3: openai, stripe, anthropic)
  // -------------------------------------------------------
  providers: {
    openai: {
      name: "openai",
      fileIds: ["src/gateway/chat.ts", "src/gateway/image.ts"],
      apiCallIds: [
        "src/gateway/chat.ts:18:openai-chat-completions",
        "src/gateway/chat.ts:72:openai-embeddings",
        "src/gateway/chat.ts:98:openai-chat-completions-stream",
        "src/gateway/chat.ts:115:openai-embeddings-batch",
        "src/gateway/image.ts:22:openai-images-generations",
      ],
      findingIds: ["finding-0001", "finding-0002", "finding-0004"],
      estimatedMonthlyCost: 185.0,
      endpoints: ["chat-completions", "embeddings", "images-generations"],
    },

    anthropic: {
      name: "anthropic",
      fileIds: ["src/gateway/chat.ts", "src/gateway/image.ts"],
      apiCallIds: [
        "src/gateway/chat.ts:47:anthropic-messages",
        "src/gateway/image.ts:55:anthropic-messages-vision",
      ],
      findingIds: ["finding-0003"],
      estimatedMonthlyCost: 84.0,
      endpoints: ["messages"],
    },

    stripe: {
      name: "stripe",
      fileIds: ["src/billing/stripe.ts"],
      apiCallIds: [
        "src/billing/stripe.ts:31:stripe-payment-intents-create",
        "src/billing/stripe.ts:58:stripe-customers-list",
        "src/billing/stripe.ts:84:stripe-charges-create",
      ],
      findingIds: ["finding-0005", "finding-0006"],
      estimatedMonthlyCost: null,
      endpoints: ["payment-intents-create", "customers-list", "charges-create"],
    },
  },
};
