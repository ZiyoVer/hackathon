const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "API xatosi" }));
    const detail = typeof body.detail === "string" ? body.detail : "API xatosi";
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
