import { ApiCallMatch, LineMatcher } from "./types";

const STRIPE_METHODS: Record<string, string> = {
  create: "POST",
  list: "GET",
  retrieve: "GET",
  update: "POST",
  del: "DELETE",
  cancel: "POST",
};

export const stripeMatcher: LineMatcher = {
  name: "stripe",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const regex =
      /\b(?:stripe|stripeClient)\.(paymentIntents|checkout\.sessions|customers|subscriptions|paymentMethods|refunds|invoices)\.(create|list|retrieve|update|del|cancel)\s*\(/gi;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const resource = match[1];
      const action = match[2];
      const resourcePath = resource.replace(/\./g, "/");
      const method = STRIPE_METHODS[action] ?? "POST";
      const endpoint =
        action === "create" || action === "list"
          ? `https://api.stripe.com/v1/${resourcePath}`
          : `https://api.stripe.com/v1/${resourcePath}/{id}`;

      matches.push({
        kind: "sdk",
        provider: "stripe",
        sdk: "stripe",
        method,
        endpoint,
        resource: resourcePath,
        action,
        batchCapable: action === "list",
        cacheCapable: action === "list" || action === "retrieve",
        inferredCostRisk: action === "create" ? ["duplicate-stripe-create-risk"] : [],
        rawMatch: match[0],
      });
    }

    return matches;
  },
};
