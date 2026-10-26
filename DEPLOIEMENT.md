# Déploiement direct — Jémor Space

Le site est hébergé sur Vercel, avec Supabase pour l’authentification, la base et le stockage. Ce guide n’utilise pas GitHub.

## Configuration Vercel

Projet : `jemor-space`. Framework : Next.js. Node : 22.x. Commandes : `npm install --no-audit --no-fund` et `npm run build`.

Variables requises : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` et `PUSH_DISPATCH_SECRET`. Seule la clé publique VAPID et les deux variables Supabase `NEXT_PUBLIC_*` sont accessibles au navigateur. Les secrets VAPID privés et de dispatch sont à garder côté serveur.

## Configuration Supabase

Appliquer les migrations complémentaires dans l’ordre. La table `push_subscriptions` dispose du RLS et de politiques limitées à l’utilisateur connecté. Le secret `jemor_push_dispatch_secret` est conservé dans Supabase Vault; le déclencheur de notifications invoque l’endpoint serveur Vercel à l’aide de `pg_net`. Ne pas mettre ce secret en clair dans une migration versionnée.

## Vérifications après publication

1. Vérifier que la dernière version du déploiement est `READY` et que la page publique répond en HTTP 200.
2. Tester connexion et création de profil, publication image/vidéo, stories et Reels.
3. Avec deux comptes, tester demande d’ami, publication, commentaires/réactions, messagerie et indicateur de lecture.
4. Ouvrir la partie Notifications et vérifier l’arrivée des événements. Autoriser les notifications système et installer la PWA pour tester les alertes Web Push en arrière-plan.
5. Vérifier l’affichage mobile, le mode hors ligne et les journaux du déploiement Vercel.

## Limites fonctionnelles à garder visibles

La musique de story est une piste audio attachée séparément; elle n’est pas mixée/réencodée dans le fichier vidéo d’origine. Les listes de villes proviennent d’un fournisseur externe avec une liste de repli si celui-ci est indisponible.
