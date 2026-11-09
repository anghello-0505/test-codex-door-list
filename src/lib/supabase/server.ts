import "server-only";
import { createClient } from "@supabase/supabase-js";

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export async function authenticatedBuyerClient(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return null;
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;
  const client = createClient(url, key, { auth: authOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  return !error && data.user ? { client, buyerId: data.user.id } : null;
}

export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: authOptions });
}

