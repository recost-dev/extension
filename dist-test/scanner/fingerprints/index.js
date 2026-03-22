"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_PROVIDERS = exports.vertex = exports.mistral = exports.cohere = exports.gemini = exports.bedrock = exports.firebase = exports.supabase = exports.stripe = exports.anthropic = exports.openai = void 0;
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
//# sourceMappingURL=index.js.map