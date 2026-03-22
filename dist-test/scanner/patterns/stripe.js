"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeMatcher = void 0;
const registry_1 = require("../fingerprints/registry");
const STRIPE_METHODS = {
    create: "POST",
    list: "GET",
    retrieve: "GET",
    update: "POST",
    del: "DELETE",
    cancel: "POST",
};
exports.stripeMatcher = {
    name: "stripe",
    matchLine(line) {
        const matches = [];
        const regex = /\b(?:stripe|stripeClient)\.(paymentIntents|checkout\.sessions|customers|subscriptions|paymentMethods|refunds|invoices)\.(create|list|retrieve|update|del|cancel)\s*\(/gi;
        let match;
        while ((match = regex.exec(line)) !== null) {
            const resource = match[1];
            const action = match[2];
            const pattern = `${resource}.${action}`;
            const reg = (0, registry_1.lookupMethod)("stripe", pattern);
            // Fallback endpoint construction
            const resourcePath = resource.replace(/\./g, "/");
            const fbMethod = STRIPE_METHODS[action] ?? "POST";
            const fbEndpoint = action === "create" || action === "list"
                ? `https://api.stripe.com/v1/${resourcePath}`
                : `https://api.stripe.com/v1/${resourcePath}/{id}`;
            if (!reg)
                console.warn(`[fingerprints] no registry entry for stripe/${pattern}`);
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
//# sourceMappingURL=stripe.js.map