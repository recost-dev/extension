"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProject = createProject;
exports.validateRcApiKey = validateRcApiKey;
exports.submitScan = submitScan;
exports.getAllEndpoints = getAllEndpoints;
exports.getAllSuggestions = getAllSuggestions;
exports.validateApiKey = validateApiKey;
const BASE_URL = "https://api.recost.dev";
async function apiFetch(path, init, rcApiKey) {
    const authHeaders = rcApiKey
        ? { "Authorization": `Bearer ${rcApiKey}` }
        : {};
    const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...authHeaders, ...init?.headers },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.error?.message ?? `API error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return res.json();
}
async function createProject(name, rcApiKey) {
    const { data } = await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
    }, rcApiKey);
    return data.id;
}
async function validateRcApiKey(rcApiKey) {
    if (!rcApiKey.startsWith("rc-")) {
        const err = new Error("Invalid ReCost API key — keys must start with rc-");
        err.status = 401;
        throw err;
    }
    await apiFetch("/projects?limit=1", undefined, rcApiKey);
}
async function submitScan(projectId, apiCalls, rcApiKey) {
    const { data } = await apiFetch(`/projects/${projectId}/scans`, { method: "POST", body: JSON.stringify({ apiCalls }) }, rcApiKey);
    return { scanId: data.id, summary: data.summary };
}
async function getAllEndpoints(projectId, scanId) {
    const results = [];
    let page = 1;
    while (true) {
        const { data, pagination } = await apiFetch(`/projects/${projectId}/endpoints?scanId=${scanId}&limit=100&page=${page}`);
        results.push(...data);
        if (!pagination.hasNext)
            break;
        page++;
    }
    return results;
}
async function getAllSuggestions(projectId, scanId) {
    const results = [];
    let page = 1;
    while (true) {
        const { data, pagination } = await apiFetch(`/projects/${projectId}/suggestions?scanId=${scanId}&limit=100&page=${page}`);
        results.push(...data);
        if (!pagination.hasNext)
            break;
        page++;
    }
    return results;
}
/**
 * Validates an API key by hitting a projects endpoint (which accepts rc- API keys via requireAuth).
 * Returns null always — email is not available from API key auth.
 * Throws with err.status === 401 for invalid key.
 * Throws without .status for network errors.
 */
async function validateApiKey(key) {
    if (!key.startsWith("rc-")) {
        const err = new Error("Invalid ReCost API key — keys must start with rc-");
        err.status = 401;
        throw err;
    }
    await apiFetch("/projects?limit=1", undefined, key);
    return null;
}
//# sourceMappingURL=api-client.js.map