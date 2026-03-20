"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyEndpointScope = classifyEndpointScope;
exports.detectEndpointProvider = detectEndpointProvider;
const HOST_PROVIDER_MAP = [
    { test: /(^|\.)openai\.com$/i, provider: "openai" },
    { test: /(^|\.)anthropic\.com$/i, provider: "anthropic" },
    { test: /(^|\.)stripe\.com$/i, provider: "stripe" },
    { test: /^api\.github\.com$/i, provider: "github" },
    { test: /(^|\.)api\.coingecko\.com$/i, provider: "coingecko" },
    { test: /(^|\.)newsdata\.io$/i, provider: "newsdata" },
    { test: /^hacker-news\.firebaseio\.com$/i, provider: "hacker-news" },
    { test: /(^|\.)wttr\.in$/i, provider: "weather" },
    { test: /(^|\.)zenquotes\.io$/i, provider: "quotes" },
    { test: /(^|\.)ip-api\.com$/i, provider: "geo" },
    // Twilio
    { test: /(^|\.)twilio\.com$/i, provider: "twilio" },
    // SendGrid / Mailgun / Postmark
    { test: /(^|\.)sendgrid\.com$/i, provider: "sendgrid" },
    { test: /(^|\.)mailgun\.net$/i, provider: "mailgun" },
    { test: /(^|\.)api\.postmarkapp\.com$/i, provider: "postmark" },
    // AWS
    { test: /\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/i, provider: "aws-s3" },
    { test: /\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/i, provider: "aws-api-gateway" },
    { test: /\.lambda-url\.[a-z0-9-]+\.on\.aws$/i, provider: "aws-lambda" },
    // Google
    { test: /^maps\.googleapis\.com$/i, provider: "google-maps" },
    { test: /^translation\.googleapis\.com$/i, provider: "google-translate" },
    { test: /^vision\.googleapis\.com$/i, provider: "google-vision" },
    { test: /^speech\.googleapis\.com$/i, provider: "google-speech" },
    { test: /^firestore\.googleapis\.com$/i, provider: "firestore" },
    { test: /^firebase\.googleapis\.com$/i, provider: "firebase" },
    // Payments
    { test: /(^|\.)api\.paypal\.com$/i, provider: "paypal" },
    { test: /(^|\.)api-m\.paypal\.com$/i, provider: "paypal" },
    { test: /(^|\.)braintreegateway\.com$/i, provider: "braintree" },
    { test: /(^|\.)square\.com$/i, provider: "square" },
    // Auth / identity
    { test: /(^|\.)auth0\.com$/i, provider: "auth0" },
    { test: /(^|\.)okta\.com$/i, provider: "okta" },
    // CRM / support
    { test: /(^|\.)salesforce\.com$/i, provider: "salesforce" },
    { test: /(^|\.)api\.hubapi\.com$/i, provider: "hubspot" },
    { test: /(^|\.)zendesk\.com$/i, provider: "zendesk" },
    { test: /(^|\.)intercom\.io$/i, provider: "intercom" },
    // Analytics / monitoring
    { test: /(^|\.)mixpanel\.com$/i, provider: "mixpanel" },
    { test: /(^|\.)segment\.io$/i, provider: "segment" },
    { test: /(^|\.)segment\.com$/i, provider: "segment" },
    { test: /(^|\.)amplitude\.com$/i, provider: "amplitude" },
    { test: /(^|\.)datadoghq\.com$/i, provider: "datadog" },
    { test: /(^|\.)sentry\.io$/i, provider: "sentry" },
    // Messaging / notifications
    { test: /(^|\.)slack\.com$/i, provider: "slack" },
    { test: /(^|\.)discord\.com$/i, provider: "discord" },
    { test: /(^|\.)graph\.facebook\.com$/i, provider: "facebook" },
    { test: /(^|\.)api\.twitter\.com$/i, provider: "twitter" },
    { test: /(^|\.)api\.x\.com$/i, provider: "twitter" },
    // Databases / storage
    { test: /(^|\.)supabase\.co$/i, provider: "supabase" },
    { test: /(^|\.)neon\.tech$/i, provider: "neon" },
    { test: /(^|\.)planetscale\.com$/i, provider: "planetscale" },
    { test: /(^|\.)airtable\.com$/i, provider: "airtable" },
    // Search
    { test: /(^|\.)algolia\.net$/i, provider: "algolia" },
    { test: /(^|\.)algolia\.io$/i, provider: "algolia" },
    { test: /(^|\.)elastic\.co$/i, provider: "elasticsearch" },
    // Infra / deploy
    { test: /(^|\.)cloudflare\.com$/i, provider: "cloudflare" },
    { test: /(^|\.)vercel\.com$/i, provider: "vercel" },
    { test: /(^|\.)netlify\.com$/i, provider: "netlify" },
    // Video / media
    { test: /(^|\.)api\.cloudinary\.com$/i, provider: "cloudinary" },
    { test: /(^|\.)mux\.com$/i, provider: "mux" },
    // Shipping / logistics
    { test: /(^|\.)api\.shipengine\.com$/i, provider: "shipengine" },
    { test: /(^|\.)easypost\.com$/i, provider: "easypost" },
];
function isInternalHost(host) {
    const normalized = host.toLowerCase().replace(/^\[(.*)\]$/, "$1");
    return (normalized === "localhost" ||
        normalized === "127.0.0.1" ||
        normalized === "0.0.0.0" ||
        normalized === "::1" ||
        normalized.endsWith(".local") ||
        normalized.endsWith(".internal"));
}
function classifyEndpointScope(urlOrPath) {
    const value = urlOrPath.trim();
    if (!value)
        return "unknown";
    if (value.startsWith("/"))
        return "internal";
    if (/^<dynamic:[^>]+>$/i.test(value) || /\$\{[^}]+\}/.test(value)) {
        return "unknown";
    }
    if (!/^https?:\/\//i.test(value)) {
        return "unknown";
    }
    try {
        const parsed = new URL(value);
        if (!/^https?:$/i.test(parsed.protocol))
            return "unknown";
        if (!parsed.hostname)
            return "unknown";
        return isInternalHost(parsed.hostname) ? "internal" : "external";
    }
    catch {
        return "unknown";
    }
}
function detectEndpointProvider(urlOrPath) {
    const value = urlOrPath.trim();
    if (!value)
        return "unknown";
    if (value.startsWith("/"))
        return "internal";
    const dynamicMatch = value.match(/^<dynamic:([^>]+)>$/i);
    if (dynamicMatch) {
        const token = dynamicMatch[1];
        if (/base_url|api/i.test(token))
            return "dynamic-api";
        return "dynamic";
    }
    if (!/^https?:\/\//i.test(value))
        return "unknown";
    try {
        const parsed = new URL(value);
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        if (!host)
            return "unknown";
        for (const mapping of HOST_PROVIDER_MAP) {
            if (mapping.test.test(host))
                return mapping.provider;
        }
        return host;
    }
    catch {
        return "unknown";
    }
}
//# sourceMappingURL=endpoint-classification.js.map