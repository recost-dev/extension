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
async function getAllEndpoints(projectId, scanId, rcApiKey) {
    const results = [];
    let page = 1;
    while (true) {
        const { data, pagination } = await apiFetch(`/projects/${projectId}/endpoints?scanId=${scanId}&limit=100&page=${page}`, undefined, rcApiKey);
        results.push(...data);
        if (!pagination.hasNext)
            break;
        page++;
    }
    return results;
}
async function getAllSuggestions(projectId, scanId, rcApiKey) {
    const results = [];
    let page = 1;
    while (true) {
        const { data, pagination } = await apiFetch(`/projects/${projectId}/suggestions?scanId=${scanId}&limit=100&page=${page}`, undefined, rcApiKey);
        results.push(...data);
        if (!pagination.hasNext)
            break;
        page++;
    }
    return results;
}
/**
 * Validates an API key against GET /auth/me.
 * Returns AuthMeUser on success, null for 404 (dev mode — endpoint not yet deployed).
 * Throws with err.status === 401 for invalid key.
 * Throws without .status for network errors.
 */
async function validateApiKey(key) {
    if (!key.startsWith("rc-")) {
        const err = new Error("Invalid ReCost API key — keys must start with rc-");
        err.status = 401;
        throw err;
    }
    try {
        const { data } = await apiFetch("/auth/me", undefined, key);
        return data;
    }
    catch (err) {
        const error = err;
        if (error.status === 404) {
            return null; // Dev mode: auth endpoint not deployed, treat key as valid
        }
        throw err;
    }
}
//# sourceMappingURL=api-client.js.map