let csrfToken = "";
let refreshing;
export function clearSession() {
  csrfToken = "";
}
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function api(
  path,
  { method = "GET", body, signal, blob = false, retry = true } = {},
) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      "Cannot reach the server. Check your connection and try again.",
      0,
    );
  }
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status})` }));
    if (
      response.status === 403 &&
      error.error === "Invalid CSRF token" &&
      retry
    ) {
      refreshing ||= api("/auth/csrf", { retry: false }).finally(() => {
        refreshing = undefined;
      });
      await refreshing;
      return api(path, { method, body, signal, blob, retry: false });
    }
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/me"].includes(path)
    ) {
      clearSession();
      window.dispatchEvent(new Event("tempo-session-expired"));
    }
    throw new ApiError(
      [
        error.error,
        ...(Array.isArray(error.details)
          ? error.details.map((d) => `${d.path}: ${d.message}`)
          : []),
      ].join(" · "),
      response.status,
    );
  }
  if (blob) return response.blob();
  const result = await response.json();
  if (result.csrfToken) csrfToken = result.csrfToken;
  return result;
}
export async function allPages(path, signal) {
  let page = 1,
    items = [],
    result;
  do {
    result = await api(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page++}`,
      { signal },
    );
    items.push(...result.items);
  } while (items.length < result.total && result.items.length);
  return items;
}
export const mutation = (path, body = {}, method = "POST") =>
  api(path, { method, body });
