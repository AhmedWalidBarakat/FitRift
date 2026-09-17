import { supabase } from './supabaseClient';

export const API_URL = 'http://localhost:3000';

// Wraps fetch to automatically attach the logged-in user's Supabase session
// token, so the backend can verify who's making the request.
export async function authedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
