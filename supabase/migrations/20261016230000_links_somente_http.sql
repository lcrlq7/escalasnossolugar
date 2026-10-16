-- Segurança: links salvos só podem ser http(s) (bloqueia javascript:, data:, etc.)
alter table public.songs add constraint songs_youtube_url_http check (youtube_url is null or youtube_url ~* '^https?://');
alter table public.songs add constraint songs_spotify_url_http check (spotify_url is null or spotify_url ~* '^https?://');
alter table public.song_suggestions add constraint song_suggestions_link_http check (link is null or link ~* '^https?://');
