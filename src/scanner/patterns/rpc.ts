import { ApiCallMatch, LineMatcher } from "./types";

export const rpcMatcher: LineMatcher = {
  name: "rpc",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const trpcRegex = /\btrpc\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.(query|mutate|subscribe)\s*\(/gi;
    let trpcMatch: RegExpExecArray | null;
    while ((trpcMatch = trpcRegex.exec(line)) !== null) {
      const procedure = trpcMatch[1];
      const action = trpcMatch[2];
      const method = action === "query" ? "GET" : "POST";
      matches.push({
        kind: "rpc",
        provider: "trpc",
        sdk: "trpc",
        method,
        endpoint: `<rpc:trpc:${procedure}>`,
        resource: procedure,
        action,
        streaming: action === "subscribe",
        cacheCapable: action === "query",
        rawMatch: trpcMatch[0],
      });
    }

    const grpcCtorRegex = /new\s+([A-Za-z_$][\w$]*Client)\s*\(/g;
    let grpcCtorMatch: RegExpExecArray | null;
    while ((grpcCtorMatch = grpcCtorRegex.exec(line)) !== null) {
      matches.push({
        kind: "rpc",
        provider: "grpc",
        sdk: "grpc",
        method: "RPC",
        endpoint: `<rpc:grpc:${grpcCtorMatch[1]}>`,
        resource: grpcCtorMatch[1],
        action: "client_init",
        rawMatch: grpcCtorMatch[0],
      });
    }

    const grpcCallRegex = /\b([A-Za-z_$][\w$]*)\.(\w+)\(\s*(?:request|req|\{)/gi;
    let grpcCallMatch: RegExpExecArray | null;
    while ((grpcCallMatch = grpcCallRegex.exec(line)) !== null) {
      if (!/client/i.test(grpcCallMatch[1])) continue;
      const methodName = grpcCallMatch[2];
      matches.push({
        kind: "rpc",
        provider: "grpc",
        sdk: "grpc",
        method: "RPC",
        endpoint: `<rpc:grpc:${methodName}>`,
        resource: methodName,
        action: methodName,
        rawMatch: grpcCallMatch[0],
      });
    }

    return matches;
  },
};
