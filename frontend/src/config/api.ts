const isDevelopment = window.location.port === '5173';
export const API_BASE_URL = isDevelopment ? 'http://localhost:8000' : '';

export const getApiUrl = (endpoint: string): string => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${path}`;
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const url = getApiUrl(endpoint);
  return fetch(url, options);
};
