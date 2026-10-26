import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 15;

type PushSubscriptionPayload = { endpoint: string; p256dh: string; auth: string };
type PushPayload = { title?: string; body?: string; url?: string; tag?: string };

export async function POST(request: NextRequest) {
  const expected = process.env.PUSH_DISPATCH_SECRET || '';
  const provided = request.headers.get('x-push-secret') || '';
  if (!expected || !provided) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return NextResponse.json({ error: 'Service de notification non configuré.' }, { status: 503 });

  let payload: { subscriptions?: PushSubscriptionPayload[]; notification?: PushPayload };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 }); }
  const subscriptions = (Array.isArray(payload.subscriptions) ? payload.subscriptions : [])
    .filter((item) => item && typeof item.endpoint === 'string' && item.endpoint.startsWith('https://') && typeof item.p256dh === 'string' && typeof item.auth === 'string')
    .slice(0, 100);
  if (!subscriptions.length) return NextResponse.json({ ok: true, sent: 0, failed: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@jemorspace.com', publicKey, privateKey);
  const notice = payload.notification || {};
  const serialized = JSON.stringify({
    title: typeof notice.title === 'string' ? notice.title.slice(0, 120) : 'Jémor Space',
    body: typeof notice.body === 'string' ? notice.body.slice(0, 500) : 'Tu as une nouvelle activité sur Jémor Space.',
    url: typeof notice.url === 'string' && notice.url.startsWith('/') ? notice.url : '/notifications',
    tag: typeof notice.tag === 'string' ? notice.tag.slice(0, 120) : 'jemor-activity',
  });
  const outcomes = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, serialized, { TTL: 60 * 60 * 12, urgency: 'high' })));
  const sent = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
  const failed = outcomes.length - sent;
  if (failed) console.warn(`Jémor Space push: ${failed} abonnement(s) non distribués.`);
  return NextResponse.json({ ok: true, sent, failed });
}
