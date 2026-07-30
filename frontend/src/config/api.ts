const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || Boolean(window.location.port);
export const API_BASE_URL = isDev ? `http://${window.location.hostname}:8000` : '';

export const getApiUrl = (endpoint: string): string => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${path}`;
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const url = getApiUrl(endpoint);
  return fetch(url, options);
};
