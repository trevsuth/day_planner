export async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({} as { detail?: string }));
    throw new Error(data.detail || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json() as Promise<T>;
}
