'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [configMissing, setConfigMissing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setConfigMissing(true);
      setLoading(false);
      return;
    }

    let alive = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      setUser(error ? null : data.user);
      setLoading(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    let alive = true;
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (alive) setProfile((data as Profile | null) ?? null);
    });
    return () => { alive = false; };
  }, [user?.id]);

  return { user, profile, loading, configMissing, setProfile };
}
