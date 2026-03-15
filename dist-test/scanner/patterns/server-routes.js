"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverRoutesMatcher = void 0;
exports.serverRoutesMatcher = {
    name: "server-routes",
    matchLine(line) {
        const results = [];
        const expressLike = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\n]+)['"`]/gi;
        let expressMatch;
        while ((expressMatch = expressLike.exec(line)) !== null) {
            results.push({
                kind: "route",
                provider: "route-def",
                sdk: "express-like",
                method: expressMatch[1].toUpperCase(),
                endpoint: expressMatch[2],
                resource: expressMatch[2],
                action: "handler",
                rawMatch: expressMatch[0],
            });
        }
        const flaskRoute = /@[\w.]+\.route\(\s*['"`]([^'"`\n]+)['"`]\s*,\s*methods\s*=\s*\[([^\]]+)\]/gi;
        let flaskMatch;
        while ((flaskMatch = flaskRoute.exec(line)) !== null) {
            const url = flaskMatch[1];
            const methodsRaw = flaskMatch[2];
            const methods = methodsRaw.match(/[A-Za-z]+/g) ?? ["GET"];
            for (const methodName of methods) {
                results.push({
                    kind: "route",
                    provider: "route-def",
                    sdk: "flask",
                    method: methodName.toUpperCase(),
                    endpoint: url,
                    resource: url,
                    action: "handler",
                    rawMatch: flaskMatch[0],
                });
            }
        }
        const fastApiRoute = /@[\w.]+\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\n]+)['"`]/gi;
        let fastApiMatch;
        while ((fastApiMatch = fastApiRoute.exec(line)) !== null) {
            results.push({
                kind: "route",
                provider: "route-def",
                sdk: "fastapi",
                method: fastApiMatch[1].toUpperCase(),
                endpoint: fastApiMatch[2],
                resource: fastApiMatch[2],
                action: "handler",
                rawMatch: fastApiMatch[0],
            });
        }
        return results;
    },
};
//# sourceMappingURL=server-routes.js.map