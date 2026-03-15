"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcMatcher = void 0;
exports.rpcMatcher = {
    name: "rpc",
    matchLine(line) {
        const matches = [];
        const trpcRegex = /\btrpc\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.(query|mutate|subscribe)\s*\(/gi;
        let trpcMatch;
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
        let grpcCtorMatch;
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
        let grpcCallMatch;
        while ((grpcCallMatch = grpcCallRegex.exec(line)) !== null) {
            if (!/client/i.test(grpcCallMatch[1]))
                continue;
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
//# sourceMappingURL=rpc.js.map