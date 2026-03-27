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
      apiCallIds: [
        "src/gateway/chat.ts:18:openai-chat-completions",
        "src/gateway/chat.ts:47:anthropic-messages",
        "src/gateway/chat.ts:72:openai-embeddings",
        "src/gateway/chat.ts:98:openai-chat-completions-stream",
        "src/gateway/chat.ts:115:openai-embeddings-batch",
      ],
      findingIds: ["finding-0001", "finding-0002", "finding-0003"],
      providers: ["openai", "anthropic"],
    },

    "src/gateway/image.ts": {
      id: "src/gateway/image.ts",
      filePath: "src/gateway/image.ts",
      apiCallIds: [
        "src/gateway/image.ts:22:openai-images-generations",
        "src/gateway/image.ts:55:anthropic-messages-vision",
      ],
      findingIds: ["finding-0004"],
      providers: ["openai", "anthropic"],
    },

    "src/billing/stripe.ts": {
      id: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      apiCallIds: [
        "src/billing/stripe.ts:31:stripe-payment-intents-create",
        "src/billing/stripe.ts:58:stripe-customers-list",
        "src/billing/stripe.ts:84:stripe-charges-create",
      ],
      findingIds: ["finding-0005", "finding-0006"],
      providers: ["stripe"],
    },

    "src/utils/cache.ts": {
      id: "src/utils/cache.ts",
      filePath: "src/utils/cache.ts",
      apiCallIds: [],
      findingIds: [],
      providers: [],
    },

    "src/config/env.ts": {
      id: "src/config/env.ts",
      filePath: "src/config/env.ts",
      apiCallIds: [],
      findingIds: [],
      providers: [],
    },
  },

  // -------------------------------------------------------
  // API CALLS (10 total — openai×5, stripe×3, anthropic×2)
  // -------------------------------------------------------
  apiCalls: {
    "src/gateway/chat.ts:18:openai-chat-completions": {
      id: "src/gateway/chat.ts:18:openai-chat-completions",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 18,
      provider: "openai",
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      library: "openai",
      costModel: "per_token",
      frequencyClass: "single",
      batchCapable: false,
      cacheCapable: true,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/gateway/chat.ts:47:anthropic-messages": {
      id: "src/gateway/chat.ts:47:anthropic-messages",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 47,
      provider: "anthropic",
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      library: "@anthropic-ai/sdk",
      costModel: "per_token",
      frequencyClass: "conditional",
      batchCapable: false,
      cacheCapable: true,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/gateway/chat.ts:72:openai-embeddings": {
      id: "src/gateway/chat.ts:72:openai-embeddings",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 72,
      provider: "openai",
      method: "POST",
      url: "https://api.openai.com/v1/embeddings",
      library: "openai",
      costModel: "per_token",
      frequencyClass: "unbounded-loop",
      batchCapable: true,
      cacheCapable: true,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/gateway/chat.ts:98:openai-chat-completions-stream": {
      id: "src/gateway/chat.ts:98:openai-chat-completions-stream",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 98,
      provider: "openai",
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      library: "openai",
      costModel: "per_token",
      frequencyClass: "single",
      batchCapable: false,
      cacheCapable: false,
      streaming: true,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/gateway/chat.ts:115:openai-embeddings-batch": {
      id: "src/gateway/chat.ts:115:openai-embeddings-batch",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 115,
      provider: "openai",
      method: "POST",
      url: "https://api.openai.com/v1/embeddings",
      library: "openai",
      costModel: "per_token",
      frequencyClass: "bounded-loop",
      batchCapable: true,
      cacheCapable: true,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/gateway/image.ts:22:openai-images-generations": {
      id: "src/gateway/image.ts:22:openai-images-generations",
      fileId: "src/gateway/image.ts",
      filePath: "src/gateway/image.ts",
      line: 22,
      provider: "openai",
      method: "POST",
      url: "https://api.openai.com/v1/images/generations",
      library: "openai",
      costModel: "per_transaction",
      frequencyClass: "single",
      batchCapable: false,
      cacheCapable: true,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/gateway/image.ts:55:anthropic-messages-vision": {
      id: "src/gateway/image.ts:55:anthropic-messages-vision",
      fileId: "src/gateway/image.ts",
      filePath: "src/gateway/image.ts",
      line: 55,
      provider: "anthropic",
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      library: "@anthropic-ai/sdk",
      costModel: "per_token",
      frequencyClass: "single",
      batchCapable: false,
      cacheCapable: true,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/billing/stripe.ts:31:stripe-payment-intents-create": {
      id: "src/billing/stripe.ts:31:stripe-payment-intents-create",
      fileId: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      line: 31,
      provider: "stripe",
      method: "POST",
      url: "https://api.stripe.com/v1/payment_intents",
      library: "stripe",
      costModel: "per_transaction",
      frequencyClass: "single",
      batchCapable: false,
      cacheCapable: false,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/billing/stripe.ts:58:stripe-customers-list": {
      id: "src/billing/stripe.ts:58:stripe-customers-list",
      fileId: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      line: 58,
      provider: "stripe",
      method: "GET",
      url: "https://api.stripe.com/v1/customers",
      library: "stripe",
      costModel: "per_request",
      frequencyClass: "unbounded-loop",
      batchCapable: false,
      cacheCapable: false,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },

    "src/billing/stripe.ts:84:stripe-charges-create": {
      id: "src/billing/stripe.ts:84:stripe-charges-create",
      fileId: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      line: 84,
      provider: "stripe",
      method: "POST",
      url: "https://api.stripe.com/v1/charges",
      library: "stripe",
      costModel: "per_transaction",
      frequencyClass: "single",
      batchCapable: false,
      cacheCapable: false,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    },
  },

  // -------------------------------------------------------
  // FINDINGS (6 total)
  // -------------------------------------------------------
  findings: {
    "finding-0001": {
      id: "finding-0001",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 72,
      type: "n_plus_one",
      severity: "high",
      confidence: 0.95,
      description:
        "openai/embeddings is called individually for each item inside a loop. Batch all inputs into a single call to reduce N round-trips to 1.",
      evidence: [
        "for (const doc of documents) {",
        "  await openai.embeddings.create({ input: doc });",
        "}",
      ],
    },

    "finding-0002": {
      id: "finding-0002",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 18,
      type: "cache",
      severity: "high",
      confidence: 0.85,
      description:
        "openai/chat-completions is called on every request without a cache check. Repeated identical prompts incur full token costs each time.",
      evidence: [
        "const response = await openai.chat.completions.create({ model, messages });",
      ],
    },

    "finding-0003": {
      id: "finding-0003",
      fileId: "src/gateway/chat.ts",
      filePath: "src/gateway/chat.ts",
      line: 47,
      type: "rate_limit",
      severity: "medium",
      confidence: 0.78,
      description:
        "Anthropic fallback call has no retry logic. Transient 529 errors will propagate immediately instead of being retried with backoff.",
      evidence: [
        "const fallback = await anthropic.messages.create({ model, messages });",
      ],
    },

    "finding-0004": {
      id: "finding-0004",
      fileId: "src/gateway/image.ts",
      filePath: "src/gateway/image.ts",
      line: 22,
      type: "rate_limit",
      severity: "high",
      confidence: 0.9,
      description:
        "openai/images-generations is not wrapped in error handling. Content policy rejections or rate-limit errors will propagate as unhandled exceptions.",
      evidence: [
        "const image = await openai.images.generate({ model: 'dall-e-3', prompt });",
      ],
    },

    "finding-0005": {
      id: "finding-0005",
      fileId: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      line: 58,
      type: "n_plus_one",
      severity: "high",
      confidence: 0.92,
      description:
        "stripe.customers.list is called on each loop iteration without cursor reuse, causing redundant paginated API requests.",
      evidence: [
        "for (const batch of batches) {",
        "  const customers = await stripe.customers.list({ limit: 100 });",
        "}",
      ],
    },

    "finding-0006": {
      id: "finding-0006",
      fileId: "src/billing/stripe.ts",
      filePath: "src/billing/stripe.ts",
      line: 31,
      type: "redundancy",
      severity: "low",
      confidence: 0.7,
      description:
        "stripe.paymentIntents.create is called without an idempotency key. A network retry after a timeout could create duplicate charges.",
      evidence: [
        "await stripe.paymentIntents.create({ amount, currency, customer });",
      ],
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
      urls: [
        "https://api.openai.com/v1/chat/completions",
        "https://api.openai.com/v1/embeddings",
        "https://api.openai.com/v1/images/generations",
      ],
      costModels: ["per_token", "per_transaction"],
    },

    anthropic: {
      name: "anthropic",
      fileIds: ["src/gateway/chat.ts", "src/gateway/image.ts"],
      apiCallIds: [
        "src/gateway/chat.ts:47:anthropic-messages",
        "src/gateway/image.ts:55:anthropic-messages-vision",
      ],
      findingIds: ["finding-0003"],
      urls: ["https://api.anthropic.com/v1/messages"],
      costModels: ["per_token"],
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
      urls: [
        "https://api.stripe.com/v1/payment_intents",
        "https://api.stripe.com/v1/customers",
        "https://api.stripe.com/v1/charges",
      ],
      costModels: ["per_transaction", "per_request"],
    },
  },
};
