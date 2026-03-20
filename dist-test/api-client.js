"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProject = createProject;
exports.validateEcoApiKey = validateEcoApiKey;
exports.submitScan = submitScan;
exports.getAllEndpoints = getAllEndpoints;
exports.getAllSuggestions = getAllSuggestions;
const BASE_URL = "https://api.ecoapi.dev";
async function apiFetch(path, init, ecoApiKey) {
    const authHeaders = ecoApiKey
        ? { "Authorization": `Bearer ${ecoApiKey}` }
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
async function createProject(name, ecoApiKey) {
    const { data } = await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
    }, ecoApiKey);
    return data.id;
}
async function validateEcoApiKey(ecoApiKey) {
    await apiFetch("/projects?limit=1", undefined, ecoApiKey);
}
async function submitScan(projectId, apiCalls, ecoApiKey) {
    const { data } = await apiFetch(`/projects/${projectId}/scans`, { method: "POST", body: JSON.stringify({ apiCalls }) }, ecoApiKey);
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
//# sourceMappingURL=api-client.js.map