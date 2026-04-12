revoke all on table public.user_wiki_pages from anon, authenticated;
revoke all on table public.user_wiki_logs from anon, authenticated;

grant select on table public.user_wiki_pages to anon, authenticated;
grant select on table public.user_wiki_logs to anon, authenticated;
