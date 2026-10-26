import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Configuration Supabase manquante.' }, { status: 503 });

  const supabase = createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Session expirée. Reconnecte-toi.' }, { status: 401 });

  let payload: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Données invalides.' }, { status: 400 }); }
  const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : '';
  const p256dh = typeof payload.keys?.p256dh === 'string' ? payload.keys.p256dh : '';
  const auth = typeof payload.keys?.auth === 'string' ? payload.keys.auth : '';
  if (!endpoint.startsWith('https://') || endpoint.length > 3000 || !p256dh || !auth) {
    return NextResponse.json({ error: 'Abonnement de notification invalide.' }, { status: 400 });
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) {
    console.error('Enregistrement abonnement push impossible:', error.message);
    return NextResponse.json({ error: 'Impossible d’enregistrer cet appareil pour les notifications.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
