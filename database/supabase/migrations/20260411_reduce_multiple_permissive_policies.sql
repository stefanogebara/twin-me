-- Reduce overlapping permissive RLS policies without changing access semantics.
-- Public-read tables keep their broad SELECT policy, while owner-scoped ALL
-- policies are split into explicit write policies so they no longer overlap on SELECT.

begin;

-- aio.aio_agent_verification_history
do $$
begin
  if to_regclass('aio.aio_agent_verification_history') is not null then
    execute $policy$
      drop policy if exists "Users can manage their agent verification history" on aio.aio_agent_verification_history
    $policy$;

    execute $policy$
      create policy "Users insert their agent verification history"
      on aio.aio_agent_verification_history
      for insert
      to public
      with check (
        agent_id in (
          select aio_agents.id
          from aio.aio_agents
          where aio_agents.owner_id = (select auth.uid())
        )
      )
    $policy$;

    execute $policy$
      create policy "Users update their agent verification history"
      on aio.aio_agent_verification_history
      for update
      to public
      using (
        agent_id in (
          select aio_agents.id
          from aio.aio_agents
          where aio_agents.owner_id = (select auth.uid())
        )
      )
      with check (
        agent_id in (
          select aio_agents.id
          from aio.aio_agents
          where aio_agents.owner_id = (select auth.uid())
        )
      )
    $policy$;

    execute $policy$
      create policy "Users delete their agent verification history"
      on aio.aio_agent_verification_history
      for delete
      to public
      using (
        agent_id in (
          select aio_agents.id
          from aio.aio_agents
          where aio_agents.owner_id = (select auth.uid())
        )
      )
    $policy$;
  end if;
end
$$;

-- aio.aio_followed_traders
do $$
begin
  if to_regclass('aio.aio_followed_traders') is not null then
    execute $policy$
      drop policy if exists "Users can manage their follows" on aio.aio_followed_traders
    $policy$;

    execute $policy$
      create policy "Users insert their follows"
      on aio.aio_followed_traders
      for insert
      to public
      with check ((select auth.uid()) = follower_id)
    $policy$;

    execute $policy$
      create policy "Users update their follows"
      on aio.aio_followed_traders
      for update
      to public
      using ((select auth.uid()) = follower_id)
      with check ((select auth.uid()) = follower_id)
    $policy$;

    execute $policy$
      create policy "Users delete their follows"
      on aio.aio_followed_traders
      for delete
      to public
      using ((select auth.uid()) = follower_id)
    $policy$;
  end if;
end
$$;

-- aio.aio_game_leaderboards
do $$
begin
  if to_regclass('aio.aio_game_leaderboards') is not null then
    execute $policy$
      drop policy if exists "Users can manage own leaderboard entry" on aio.aio_game_leaderboards
    $policy$;

    execute $policy$
      create policy "Users insert own leaderboard entry"
      on aio.aio_game_leaderboards
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users update own leaderboard entry"
      on aio.aio_game_leaderboards
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users delete own leaderboard entry"
      on aio.aio_game_leaderboards
      for delete
      to authenticated
      using ((select auth.uid()) = user_id)
    $policy$;
  end if;
end
$$;

-- aio.aio_game_sessions
do $$
begin
  if to_regclass('aio.aio_game_sessions') is not null then
    execute $policy$
      drop policy if exists "Users can manage own game sessions" on aio.aio_game_sessions
    $policy$;

    execute $policy$
      create policy "Users insert own game sessions"
      on aio.aio_game_sessions
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users update own game sessions"
      on aio.aio_game_sessions
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users delete own game sessions"
      on aio.aio_game_sessions
      for delete
      to authenticated
      using ((select auth.uid()) = user_id)
    $policy$;
  end if;
end
$$;

-- aio.aio_user_bets
do $$
begin
  if to_regclass('aio.aio_user_bets') is not null then
    execute $policy$
      drop policy if exists "Users can manage their own bets" on aio.aio_user_bets
    $policy$;

    execute $policy$
      create policy "Users insert their own bets"
      on aio.aio_user_bets
      for insert
      to public
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users update their own bets"
      on aio.aio_user_bets
      for update
      to public
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users delete their own bets"
      on aio.aio_user_bets
      for delete
      to public
      using ((select auth.uid()) = user_id)
    $policy$;
  end if;
end
$$;

-- aio.aio_user_portfolios
do $$
begin
  if to_regclass('aio.aio_user_portfolios') is not null then
    execute $policy$
      drop policy if exists "Users can manage their own portfolio" on aio.aio_user_portfolios
    $policy$;

    execute $policy$
      create policy "Users insert their own portfolio"
      on aio.aio_user_portfolios
      for insert
      to public
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users update their own portfolio"
      on aio.aio_user_portfolios
      for update
      to public
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users delete their own portfolio"
      on aio.aio_user_portfolios
      for delete
      to public
      using ((select auth.uid()) = user_id)
    $policy$;
  end if;
end
$$;

-- aio.aio_user_positions
do $$
begin
  if to_regclass('aio.aio_user_positions') is not null then
    execute $policy$
      drop policy if exists "Users can manage their own positions" on aio.aio_user_positions
    $policy$;

    execute $policy$
      create policy "Users insert their own positions"
      on aio.aio_user_positions
      for insert
      to public
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users update their own positions"
      on aio.aio_user_positions
      for update
      to public
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $policy$;

    execute $policy$
      create policy "Users delete their own positions"
      on aio.aio_user_positions
      for delete
      to public
      using ((select auth.uid()) = user_id)
    $policy$;
  end if;
end
$$;

-- public.eval_runs
do $$
begin
  if to_regclass('public.eval_runs') is not null then
    execute $policy$
      drop policy if exists "Evaluators manage own runs" on public.eval_runs
    $policy$;

    execute $policy$
      drop policy if exists "Users own eval_runs" on public.eval_runs
    $policy$;

    execute $policy$
      create policy "Users can view related eval runs"
      on public.eval_runs
      for select
      to public
      using (
        (evaluator_id = (select auth.uid()))
        or
        (user_id = (select auth.uid()))
      )
    $policy$;

    execute $policy$
      create policy "Users can insert related eval runs"
      on public.eval_runs
      for insert
      to public
      with check (
        (evaluator_id = (select auth.uid()))
        or
        (user_id = (select auth.uid()))
      )
    $policy$;

    execute $policy$
      create policy "Users can update related eval runs"
      on public.eval_runs
      for update
      to public
      using (
        (evaluator_id = (select auth.uid()))
        or
        (user_id = (select auth.uid()))
      )
      with check (
        (evaluator_id = (select auth.uid()))
        or
        (user_id = (select auth.uid()))
      )
    $policy$;

    execute $policy$
      create policy "Users can delete related eval runs"
      on public.eval_runs
      for delete
      to public
      using (
        (evaluator_id = (select auth.uid()))
        or
        (user_id = (select auth.uid()))
      )
    $policy$;
  end if;
end
$$;

commit;
