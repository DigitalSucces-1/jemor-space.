# Jémor Space

Réseau social responsive et installable (PWA), construit avec Next.js, React et Supabase. Le déploiement est géré directement depuis Vercel et la base de données/authentification/médias depuis Supabase.

## Fonctionnalités

- Inscription et connexion par e-mail/mot de passe, avec affichage/masquage du mot de passe.
- Fil social avec publications textuelles, photos et vidéos, commentaires, réactions et partage de lien.
- Stories texte, image ou vidéo, avec fichier musical séparé et vocal enregistré; expiration à 24 heures. La musique est jointe comme piste audio distincte et n’est pas mixée dans la vidéo source.
- Espace Réels réservé aux vidéos; les lecteurs préservent le rapport largeur/hauteur du média.
- Messages texte, images, vidéos et notes vocales, modification, suppression pour soi ou pour tous et état de lecture.
- Profil avec photo de profil/couverture, liens multiples, pays avec drapeau et suggestions de ville selon le pays.
- Groupes publics/privés, demande d’accès et approbation, rôles d’administrateur et salons de conversation collectifs.
- Notifications applicatives pour demandes d’amis, nouvelles publications, commentaires, réactions, stories, messages et demandes d’accès aux groupes.
- Installation PWA sur ordinateur et mobile, mode hors ligne minimal et notifications système Web Push après autorisation.

## Variables d’environnement

Définir dans Vercel et dans `.env.local` pour le développement :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (clé publique, destinée au client)
- `VAPID_PRIVATE_KEY` (secret serveur uniquement)
- `VAPID_SUBJECT`
- `PUSH_DISPATCH_SECRET` (secret partagé entre Supabase Vault et l’API Vercel)

Ne jamais exposer la clé VAPID privée, le secret de dispatch, une clé Supabase secrète/service-role ou le fichier `.env.local` au navigateur ou dans une archive publique.

## Développement

```sh
npm install
npm run typecheck
npm run build
npm run dev
```

## Supabase

La migration initiale se trouve dans `supabase/migrations/202610250001_initial_jemor_space.sql`. Les migrations complémentaires ajoutent les médias/Reels/groupes, les notifications automatiques et les abonnements Web Push. Ne réexécute pas la migration initiale sur la base existante. Les migrations de push nécessitent le module `pg_net` et le secret `jemor_push_dispatch_secret` dans Supabase Vault.

## Déploiement

Le projet est associé au projet Vercel `jemor-space`. Déployer via l’API ou le tableau de bord Vercel en utilisant le code source validé et les variables d’environnement listées plus haut. Après chaque déploiement, contrôler l’état du build et tester au minimum la connexion, les médias, les conversations et les notifications avec deux comptes. Aucun flux de livraison GitHub n’est nécessaire à ce projet.
