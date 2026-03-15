export type EndpointScope = "internal" | "external" | "unknown";
export declare function classifyEndpointScope(urlOrPath: string): EndpointScope;
export declare function detectEndpointProvider(urlOrPath: string): string;
