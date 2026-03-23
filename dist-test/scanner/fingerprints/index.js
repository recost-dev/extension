"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOST_MAP_PROVIDERS = exports.ALL_PROVIDERS = exports.vertex = exports.mistral = exports.cohere = exports.gemini = exports.bedrock = exports.firebase = exports.supabase = exports.stripe = exports.anthropic = exports.openai = void 0;
const openai_json_1 = __importDefault(require("./openai.json"));
exports.openai = openai_json_1.default;
const anthropic_json_1 = __importDefault(require("./anthropic.json"));
exports.anthropic = anthropic_json_1.default;
const stripe_json_1 = __importDefault(require("./stripe.json"));
exports.stripe = stripe_json_1.default;
const supabase_json_1 = __importDefault(require("./supabase.json"));
exports.supabase = supabase_json_1.default;
const firebase_json_1 = __importDefault(require("./firebase.json"));
exports.firebase = firebase_json_1.default;
const bedrock_json_1 = __importDefault(require("./bedrock.json"));
exports.bedrock = bedrock_json_1.default;
const gemini_json_1 = __importDefault(require("./gemini.json"));
exports.gemini = gemini_json_1.default;
const cohere_json_1 = __importDefault(require("./cohere.json"));
exports.cohere = cohere_json_1.default;
const mistral_json_1 = __importDefault(require("./mistral.json"));
exports.mistral = mistral_json_1.default;
const vertex_json_1 = __importDefault(require("./vertex.json"));
exports.vertex = vertex_json_1.default;
// Host-mapping providers (no methods — used only for host → provider resolution)
const free_apis_json_1 = __importDefault(require("./free-apis.json"));
const messaging_json_1 = __importDefault(require("./messaging.json"));
const aws_extended_json_1 = __importDefault(require("./aws-extended.json"));
const google_apis_json_1 = __importDefault(require("./google-apis.json"));
const payments_extended_json_1 = __importDefault(require("./payments-extended.json"));
const identity_json_1 = __importDefault(require("./identity.json"));
const crm_json_1 = __importDefault(require("./crm.json"));
const analytics_json_1 = __importDefault(require("./analytics.json"));
const databases_extended_json_1 = __importDefault(require("./databases-extended.json"));
const search_json_1 = __importDefault(require("./search.json"));
const infra_json_1 = __importDefault(require("./infra.json"));
const media_json_1 = __importDefault(require("./media.json"));
const shipping_json_1 = __importDefault(require("./shipping.json"));
const openai_compatible_providers_json_1 = __importDefault(require("./openai-compatible-providers.json"));
/** Core AI / billing providers — have methods, pricing, and language support */
exports.ALL_PROVIDERS = [
    openai_json_1.default,
    anthropic_json_1.default,
    stripe_json_1.default,
    supabase_json_1.default,
    firebase_json_1.default,
    bedrock_json_1.default,
    gemini_json_1.default,
    cohere_json_1.default,
    mistral_json_1.default,
    vertex_json_1.default,
];
/** Host-only mapping providers — used solely to resolve hostname → provider id */
exports.HOST_MAP_PROVIDERS = [
    free_apis_json_1.default,
    messaging_json_1.default,
    aws_extended_json_1.default,
    google_apis_json_1.default,
    payments_extended_json_1.default,
    identity_json_1.default,
    crm_json_1.default,
    analytics_json_1.default,
    databases_extended_json_1.default,
    search_json_1.default,
    infra_json_1.default,
    media_json_1.default,
    shipping_json_1.default,
    openai_compatible_providers_json_1.default,
];
//# sourceMappingURL=index.js.map