"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatAdapterError = void 0;
exports.ensureStringContent = ensureStringContent;
class ChatAdapterError extends Error {
    code;
    provider;
    envKeyName;
    status;
    constructor(code, message, options = {}) {
        super(message);
        this.name = "ChatAdapterError";
        this.code = code;
        this.provider = options.provider;
        this.envKeyName = options.envKeyName;
        this.status = options.status;
    }
}
exports.ChatAdapterError = ChatAdapterError;
function ensureStringContent(value, fallbackMessage, provider) {
    if (typeof value === "string" && value.trim()) {
        return value;
    }
    throw new ChatAdapterError("malformed_response", fallbackMessage, { provider });
}
//# sourceMappingURL=errors.js.map