import type { ApiCallInput, EndpointRecord, Suggestion, ScanSummary } from "./analysis/types";

const BASE_URL = "https://api.ecoapi.dev";

interface ApiError {
  error?: { message?: string };
}

async function apiFetch<T>(path: string, init?: RequestInit, ecoApiKey?: string): Promise<T> {
  const authHeaders: Record<string, string> = ecoApiKey
    ? { "Authorization": `Bearer ${ecoApiKey}` }
    : {};
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiError;
    const msg = body?.error?.message ?? `API error ${res.status}`;
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function createProject(name: string, ecoApiKey?: string): Promise<string> {
  const { data } = await apiFetch<{ data: { id: string } }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  }, ecoApiKey);
  return data.id;
}

export async function validateEcoApiKey(ecoApiKey: string): Promise<void> {
  await apiFetch("/projects?limit=1", undefined, ecoApiKey);
}

export interface ScanResult {
  scanId: string;
  summary: ScanSummary;
}

export async function submitScan(projectId: string, apiCalls: ApiCallInput[], ecoApiKey?: string): Promise<ScanResult> {
  const { data } = await apiFetch<{ data: { id: string; summary: ScanSummary } }>(
    `/projects/${projectId}/scans`,
    { method: "POST", body: JSON.stringify({ apiCalls }) },
    ecoApiKey
  );
  return { scanId: data.id, summary: data.summary };
}

export async function getAllEndpoints(projectId: string, scanId: string): Promise<EndpointRecord[]> {
  const results: EndpointRecord[] = [];
  let page = 1;
  while (true) {
    const { data, pagination } = await apiFetch<{
      data: EndpointRecord[];
      pagination: { hasNext: boolean };
    }>(`/projects/${projectId}/endpoints?scanId=${scanId}&limit=100&page=${page}`);
    results.push(...data);
    if (!pagination.hasNext) break;
    page++;
  }
  return results;
}

export async function getAllSuggestions(projectId: string, scanId: string): Promise<Suggestion[]> {
  const results: Suggestion[] = [];
  let page = 1;
  while (true) {
    const { data, pagination } = await apiFetch<{
      data: Suggestion[];
      pagination: { hasNext: boolean };
    }>(`/projects/${projectId}/suggestions?scanId=${scanId}&limit=100&page=${page}`);
    results.push(...data);
    if (!pagination.hasNext) break;
    page++;
  }
  return results;
}

export interface AuthMeUser {
  email: string;
}

/**
 * Validates an API key against GET /auth/me.
 * Returns AuthMeUser on success, null for 404 (dev mode — endpoint not yet deployed).
 * Throws with err.status === 401 for invalid key.
 * Throws without .status for network errors.
 */
export async function validateApiKey(key: string): Promise<AuthMeUser | null> {
  try {
    const { data } = await apiFetch<{ data: AuthMeUser }>("/auth/me", undefined, key);
    return data;
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 404) {
      return null; // Dev mode: auth endpoint not deployed, treat key as valid
    }
    throw err;
  }
}
