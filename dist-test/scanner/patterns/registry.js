"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_MATCHERS = exports.LINE_MATCHERS = void 0;
const generic_http_1 = require("./generic-http");
const openai_compatible_1 = require("./openai-compatible");
const provider_anthropic_1 = require("./provider-anthropic");
const provider_gemini_1 = require("./provider-gemini");
const provider_bedrock_1 = require("./provider-bedrock");
const provider_vertex_1 = require("./provider-vertex");
const provider_cohere_1 = require("./provider-cohere");
const provider_mistral_1 = require("./provider-mistral");
const graphql_1 = require("./graphql");
const firebase_supabase_1 = require("./firebase-supabase");
const stripe_1 = require("./stripe");
const rpc_1 = require("./rpc");
const server_routes_1 = require("./server-routes");
exports.LINE_MATCHERS = [
    generic_http_1.genericHttpMatcher,
    openai_compatible_1.openAiCompatibleMatcher,
    provider_anthropic_1.anthropicMatcher,
    provider_gemini_1.geminiMatcher,
    provider_bedrock_1.bedrockMatcher,
    provider_vertex_1.vertexMatcher,
    provider_cohere_1.cohereMatcher,
    provider_mistral_1.mistralMatcher,
    graphql_1.graphqlMatcher,
    firebase_supabase_1.firebaseSupabaseMatcher,
    stripe_1.stripeMatcher,
    rpc_1.rpcMatcher,
];
exports.ROUTE_MATCHERS = [server_routes_1.serverRoutesMatcher];
//# sourceMappingURL=registry.js.map