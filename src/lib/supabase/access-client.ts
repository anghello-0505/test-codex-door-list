"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
export function accessClient() {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { storage: window.sessionStorage, storageKey: "doorlist-access-session",
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}
