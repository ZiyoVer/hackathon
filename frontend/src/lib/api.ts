const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const MANAGER_KEY = "sqb_manager_token";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Server xatosi" }));
    const detail = typeof body.detail === "string" ? body.detail : "Server xatosi";
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  return parseResponse<T>(response);
}

export async function apiPost<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseResponse<TResponse>(response);
}

export async function apiUpload<TResponse>(path: string, file: File): Promise<TResponse> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body
  });
  return parseResponse<TResponse>(response);
}

export function getManagerToken(): string | null {
  return localStorage.getItem(MANAGER_KEY);
}

export function setManagerToken(token: string | null): void {
  if (token) localStorage.setItem(MANAGER_KEY, token);
  else localStorage.removeItem(MANAGER_KEY);
}

function managerHeaders(): Record<string, string> {
  const token = getManagerToken();
  return token ? { "X-Manager-Token": token } : {};
}

export async function apiGetManager<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: managerHeaders() });
  return parseResponse<T>(response);
}

export async function apiPostManager<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...managerHeaders() },
    body: JSON.stringify(body)
  });
  return parseResponse<TResponse>(response);
}
