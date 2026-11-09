"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function useBuyerSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  return { session, checking: !!supabase && checking };
}
