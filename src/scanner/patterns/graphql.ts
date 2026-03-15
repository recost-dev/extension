import { ApiCallMatch, LineMatcher } from "./types";

function extractOperationInfo(text: string): { type?: string; name?: string } {
  const op = text.match(/\b(query|mutation|subscription)\s+([A-Za-z_][\w]*)/i);
  if (!op) return {};
  return { type: op[1].toLowerCase(), name: op[2] };
}

export const graphqlMatcher: LineMatcher = {
  name: "graphql",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const requestRegex = /\brequest\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]{1,400})\)/gi;
    let requestMatch: RegExpExecArray | null;
    while ((requestMatch = requestRegex.exec(line)) !== null) {
      const endpoint = requestMatch[1];
      const queryText = requestMatch[2];
      const operation = extractOperationInfo(queryText);
      matches.push({
        kind: "graphql",
        provider: "graphql",
        sdk: "graphql-request",
        method: "POST",
        endpoint,
        operationName: operation.name,
        action: operation.type,
        batchCapable: /\[\s*query\s*\]/i.test(queryText) || /batch/i.test(line),
        cacheCapable: operation.type === "query",
        rawMatch: requestMatch[0],
      });
    }

    const apolloRegex = /\b(?:apolloClient|client)\.(query|mutate|subscribe)\s*\(\s*\{[\s\S]{0,400}?\}/gi;
    let apolloMatch: RegExpExecArray | null;
    while ((apolloMatch = apolloRegex.exec(line)) !== null) {
      const action = apolloMatch[1].toLowerCase();
      matches.push({
        kind: "graphql",
        provider: "graphql",
        sdk: "apollo-client",
        method: "POST",
        endpoint: "<dynamic:graphql-endpoint>",
        action: action === "mutate" ? "mutation" : action === "subscribe" ? "subscription" : "query",
        streaming: action === "subscribe",
        cacheCapable: action === "query",
        rawMatch: apolloMatch[0],
      });
    }

    const urqlRegex = /\b(?:client|urqlClient)\.(query|mutation|subscription)\s*\(/gi;
    let urqlMatch: RegExpExecArray | null;
    while ((urqlMatch = urqlRegex.exec(line)) !== null) {
      const action = urqlMatch[1].toLowerCase();
      matches.push({
        kind: "graphql",
        provider: "graphql",
        sdk: "urql",
        method: "POST",
        endpoint: "<dynamic:graphql-endpoint>",
        action,
        streaming: action === "subscription",
        cacheCapable: action === "query",
        rawMatch: urqlMatch[0],
      });
    }

    const relayRegex = /\b(fetchQuery|commitMutation|requestSubscription)\s*\(/gi;
    let relayMatch: RegExpExecArray | null;
    while ((relayMatch = relayRegex.exec(line)) !== null) {
      const token = relayMatch[1];
      const action = token === "commitMutation" ? "mutation" : token === "requestSubscription" ? "subscription" : "query";
      matches.push({
        kind: "graphql",
        provider: "graphql",
        sdk: "relay",
        method: "POST",
        endpoint: "<dynamic:graphql-endpoint>",
        action,
        streaming: action === "subscription",
        cacheCapable: action === "query",
        rawMatch: relayMatch[0],
      });
    }

    const rawFetchRegex =
      /fetch\(\s*['"`]([^'"`]*graphql[^'"`]*)['"`][\s\S]{0,500}?JSON\.stringify\(\s*\{[\s\S]{0,400}?query\s*:\s*([\s\S]{1,300}?)(?:,\s*variables\s*:|\})/gi;
    let rawFetchMatch: RegExpExecArray | null;
    while ((rawFetchMatch = rawFetchRegex.exec(line)) !== null) {
      const endpoint = rawFetchMatch[1];
      const queryPart = rawFetchMatch[2];
      const operation = extractOperationInfo(queryPart);
      const batched = /\bqueries\s*:/i.test(line) || /\[[\s\S]{0,60}query/i.test(line);
      const persisted = /persistedQuery|extensions\s*:\s*\{[\s\S]{0,80}persistedQuery/i.test(line);

      matches.push({
        kind: "graphql",
        provider: "graphql",
        sdk: "fetch",
        method: "POST",
        endpoint,
        action: operation.type,
        operationName: operation.name,
        batchCapable: batched,
        cacheCapable: operation.type === "query",
        inferredCostRisk: persisted ? [] : ["missing-persisted-query-hint"],
        rawMatch: rawFetchMatch[0],
      });
    }

    return matches;
  },
};
