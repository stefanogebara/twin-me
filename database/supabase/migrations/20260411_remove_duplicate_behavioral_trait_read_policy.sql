begin;

do $$
begin
  if to_regclass('public.behavioral_trait_correlations') is not null then
    execute $policy$
      drop policy if exists "Anyone can read behavioral_trait_correlations"
      on public.behavioral_trait_correlations
    $policy$;
  end if;
end
$$;

commit;
