import { LineMatcher } from "./types";
import { genericHttpMatcher } from "./generic-http";
import { openAiCompatibleMatcher } from "./openai-compatible";
import { anthropicMatcher } from "./provider-anthropic";
import { geminiMatcher } from "./provider-gemini";
import { bedrockMatcher } from "./provider-bedrock";
import { vertexMatcher } from "./provider-vertex";
import { cohereMatcher } from "./provider-cohere";
import { mistralMatcher } from "./provider-mistral";
import { graphqlMatcher } from "./graphql";
import { firebaseSupabaseMatcher } from "./firebase-supabase";
import { stripeMatcher } from "./stripe";
import { rpcMatcher } from "./rpc";
import { serverRoutesMatcher } from "./server-routes";

export const LINE_MATCHERS: LineMatcher[] = [
  genericHttpMatcher,
  openAiCompatibleMatcher,
  anthropicMatcher,
  geminiMatcher,
  bedrockMatcher,
  vertexMatcher,
  cohereMatcher,
  mistralMatcher,
  graphqlMatcher,
  firebaseSupabaseMatcher,
  stripeMatcher,
  rpcMatcher,
];

export const ROUTE_MATCHERS: LineMatcher[] = [serverRoutesMatcher];
