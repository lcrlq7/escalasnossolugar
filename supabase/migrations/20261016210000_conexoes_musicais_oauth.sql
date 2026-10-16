-- Tokens de integração (Spotify/YouTube) por usuário. Acessíveis SOMENTE pelas Edge Functions (service role).
create table public.music_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify','youtube')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.music_connections enable row level security;
revoke all on public.music_connections from anon, authenticated;

create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  return_to text not null default '/',
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;
