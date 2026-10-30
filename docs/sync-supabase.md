# Synchronisation avec Supabase

Ancrage garde tes données dans le navigateur de chaque appareil. Pour qu'ordinateur et téléphone partagent les mêmes cartes et le même historique, chaque appareil envoie sa copie à **ton** projet Supabase, qui fusionne avec les autres. Le projet gratuit suffit largement.

Sans compte, tu peux aussi passer d'un appareil à l'autre par fichier : Réglages → Télécharger une sauvegarde, puis sur l'autre appareil Réglages → Ouvrir une sauvegarde → **Fusionner**.

## 1. Créer le projet (5 min)

1. Crée un compte sur https://supabase.com, puis **New project**. Choisis une région européenne si tes cartes contiennent des informations personnelles.
2. Dans **Project Settings → API** (ou **API Keys** sur les tableaux de bord récents), note l'**URL du projet** (`https://xxxx.supabase.co`) et la clé **anon public**, appelée **Publishable key** sur les nouveaux tableaux de bord. Elle s'utilise telle quelle. Cette clé est publique par conception : la sécurité vient des règles de la table ci-dessous.

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

grant select, insert, update on public.ancrage_snapshots to authenticated;

create policy "Chacun lit sa copie" on public.ancrage_snapshots
  for select to authenticated using (user_id = auth.uid());
create policy "Chacun crée sa copie" on public.ancrage_snapshots
  for insert to authenticated with check (user_id = auth.uid());
create policy "Chacun met à jour sa copie" on public.ancrage_snapshots
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Chaque utilisateur ne voit et ne modifie que sa propre ligne.

## Synchronisation rapide

Depuis la version 1.11, Ancrage n'envoie que ce qui a changé (une révision, une carte modifiée) au lieu de toute ta base, images comprises. Il faut pour cela une seconde table. **Une seule fois**, dans **SQL Editor → New query**, colle et exécute :

```sql
create sequence if not exists public.ancrage_items_seq;

create table if not exists public.ancrage_items (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  seq bigint not null default nextval('public.ancrage_items_seq'),
  primary key (user_id, kind, id)
);

create index if not exists ancrage_items_user_seq on public.ancrage_items (user_id, seq);

-- Chaque écriture reçoit un nouveau numéro : un appareil demande ce qui a été écrit depuis son dernier passage.
create or replace function public.ancrage_items_bump() returns trigger
language plpgsql set search_path = public as $$
begin
  new.seq := nextval('public.ancrage_items_seq');
  return new;
end $$;

drop trigger if exists ancrage_items_bump on public.ancrage_items;
create trigger ancrage_items_bump before insert or update on public.ancrage_items
  for each row execute function public.ancrage_items_bump();

alter table public.ancrage_items enable row level security;
grant select, insert, update on public.ancrage_items to authenticated;
grant usage on sequence public.ancrage_items_seq to authenticated;

create policy "Chacun lit ses éléments" on public.ancrage_items
  for select to authenticated using (user_id = auth.uid());
create policy "Chacun crée ses éléments" on public.ancrage_items
  for insert to authenticated with check (user_id = auth.uid());
create policy "Chacun met à jour ses éléments" on public.ancrage_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Ensuite, sur chaque appareil, **mets d'abord l'application à jour**, puis « Synchroniser maintenant ». Le premier appareil reprend la copie complète et l'envoie élément par élément ; Réglages → Synchronisation affiche alors « Synchronisation rapide ». Un appareil resté sur une ancienne version demandera à être mis à jour.

Sans ce script, Ancrage continue de fonctionner avec la copie complète, et Réglages te le rappelle.

## 3. Choisir la confirmation d'e-mail

Dans **Authentication → URL Configuration**, mets l'adresse de ton application dans **Site URL** (par exemple `https://benjam74.github.io/Ancrage/`). Sinon le lien de confirmation renvoie vers `localhost`.

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
- Une note ou un thème modifié sur deux appareils est fusionné champ par champ : chaque champ (texte, explication, étiquettes, nom, langue…) garde sa valeur la plus récente. Modifier l'explication sur le téléphone et les étiquettes sur l'ordinateur garde les deux.
- Une suppression l'emporte sur les versions plus anciennes ; une modification faite après la suppression fait revenir la note.
- Si deux appareils écrivent en même temps, le second relit la copie du serveur, refusionne et réessaie.

## Limites connues

- Un projet gratuit se met en veille après une semaine sans activité. La synchronisation échoue alors avec « Impossible de joindre le serveur » ; rouvre le projet depuis le tableau de bord Supabase. Tes données locales ne sont pas touchées.
- Les deux appareils doivent avoir une heure système juste : « la plus récente » se décide sur l'horloge de chaque appareil.
- La copie complète est envoyée à chaque synchronisation. C'est rapide jusqu'à plusieurs dizaines de milliers de révisions.
