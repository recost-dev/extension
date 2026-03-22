import { ApiCallMatch, LineMatcher } from "./types";
import { lookupMethod } from "../fingerprints/registry";

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
      const pattern = `${resource}.${action}`;
      const reg = lookupMethod("stripe", pattern);

      // Fallback endpoint construction
      const resourcePath = resource.replace(/\./g, "/");
      const fbMethod = STRIPE_METHODS[action] ?? "POST";
      const fbEndpoint =
        action === "create" || action === "list"
          ? `https://api.stripe.com/v1/${resourcePath}`
          : `https://api.stripe.com/v1/${resourcePath}/{id}`;

      if (!reg) console.warn(`[fingerprints] no registry entry for stripe/${pattern}`);

      matches.push({
        kind: "sdk",
        provider: "stripe",
        sdk: "stripe",
        method: reg?.httpMethod ?? fbMethod,
        endpoint: reg?.endpoint ?? fbEndpoint,
        resource: resourcePath,
        action,
        batchCapable: reg?.batchCapable ?? action === "list",
        cacheCapable: reg?.cacheCapable ?? (action === "list" || action === "retrieve"),
        inferredCostRisk: action === "create" ? ["duplicate-stripe-create-risk"] : [],
        rawMatch: match[0],
      });
    }

    return matches;
  },
};
