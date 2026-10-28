# Synchronisation avec Supabase

Ancrage garde tes données dans le navigateur de chaque appareil. Pour qu'ordinateur et téléphone partagent les mêmes cartes et le même historique, chaque appareil envoie sa copie à **ton** projet Supabase, qui fusionne avec les autres. Le projet gratuit suffit largement.

Sans compte, tu peux aussi passer d'un appareil à l'autre par fichier : Réglages → Télécharger une sauvegarde, puis sur l'autre appareil Réglages → Ouvrir une sauvegarde → **Fusionner**.

## 1. Créer le projet (5 min)

1. Crée un compte sur https://supabase.com, puis **New project**. Choisis une région européenne si tes cartes contiennent des informations personnelles.
2. Dans **Project Settings → API**, note l'**URL du projet** (`https://xxxx.supabase.co`) et la clé **anon public**. Cette clé est publique par conception : la sécurité vient des règles de la table ci-dessous.

## 2. Créer la table (2 min)

Dans **SQL Editor → New query**, colle et exécute :

```sql
create table public.ancrage_snapshots (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.ancrage_snapshots enable row level security;

create policy "Chacun lit sa copie" on public.ancrage_snapshots
  for select using (user_id = auth.uid());
create policy "Chacun crée sa copie" on public.ancrage_snapshots
  for insert with check (user_id = auth.uid());
create policy "Chacun met à jour sa copie" on public.ancrage_snapshots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Chaque utilisateur ne voit et ne modifie que sa propre ligne.

## 3. Choisir la confirmation d'e-mail

Dans **Authentication → Sign In / Providers → Email** :

- laisse **Confirm email** activé si tu veux que l'adresse soit vérifiée : après « Créer le compte », ouvre le lien reçu, puis reviens dans Ancrage et clique « Se connecter » ;
- ou désactive-le pour un usage strictement personnel : « Créer le compte » connecte directement.

## 4. Connecter chaque appareil

Dans Ancrage : **Réglages → Synchronisation**. Saisis l'adresse du projet, la clé anon, ton e-mail et un mot de passe, puis :

- sur le premier appareil : **Créer le compte** ;
- sur les autres : **Se connecter**, avec les mêmes identifiants.

La synchronisation se fait à l'ouverture de l'application, après chaque manche et quand tu cliques « Synchroniser maintenant ».

## Comment les conflits sont réglés

- Les révisions et les manches de tous les appareils sont additionnées : rien ne se perd.
- Une note ou un thème modifié sur deux appareils garde la version la plus récente.
- Une suppression l'emporte sur les versions plus anciennes ; une modification faite après la suppression fait revenir la note.
- Si deux appareils écrivent en même temps, le second relit la copie du serveur, refusionne et réessaie.

## Limites connues

- Les deux appareils doivent avoir une heure système juste : « la plus récente » se décide sur l'horloge de chaque appareil.
- La copie complète est envoyée à chaque synchronisation. C'est rapide jusqu'à plusieurs dizaines de milliers de révisions.
