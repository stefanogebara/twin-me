-- Money Twin v2, fifth migration: what the person tells the system about their own money.
--
-- The learning engine reads rhythm, price and place from payments. It cannot read meaning.
-- It can see that one name sent 100 EUR six times and once 1750, and it cannot know that
-- this is a parent and therefore income; it can see 49,25 EUR going to another name and
-- cannot know whether that is a flatmate settling rent or a friend paid back for dinner.
--
-- So the person is asked, once at the start for the few things that change a computation,
-- and afterwards only about specific lines the ledger could not interpret. Their answers
-- live here.
--
-- An answer is a CLAIM, not a reading. `source` records which it was, and the twin is told
-- the difference, so a number somebody typed is never quoted as a payment that happened.
-- Rent stated as 500 EUR on the 1st is checked against the ledger, and when nothing of that
-- size leaves on that day the system says so rather than believing the form.

CREATE TABLE IF NOT EXISTS public.money_facts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,                 -- home_area | study_place | work_place | commitment | income | shared_cost | person | merchant_kind | goal
  subject               TEXT,                          -- what it is about: a merchant key, a person key, 'rent'
  subject_label         TEXT,                          -- how to say it back to them
  value                 TEXT,                          -- the answer, when it is a word
  amount                NUMERIC(12,2),                 -- when it is money
  day                   SMALLINT,                      -- day of the month, when it has one
  share                 NUMERIC(4,3),                  -- the fraction actually theirs, for a split cost
  source                TEXT NOT NULL DEFAULT 'asked', -- asked | inferred
  question_id           TEXT,                          -- which question produced it
  answered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Checked against the ledger afterwards: confirmed | different | unseen
  check_status          TEXT,
  check_note            TEXT,
  checked_at            TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS money_facts_one_per_subject
  ON public.money_facts (user_id, kind, COALESCE(subject, ''));
CREATE INDEX IF NOT EXISTS idx_money_facts_user ON public.money_facts (user_id, kind);

-- Questions already put to the person, so none is asked twice and a skip is remembered.
CREATE TABLE IF NOT EXISTS public.money_questions_asked (
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id           TEXT NOT NULL,
  asked_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered              BOOLEAN NOT NULL DEFAULT FALSE,
  skipped               BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, question_id)
);

ALTER TABLE public.money_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_questions_asked ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'money_facts' AND policyname = 'own money facts') THEN
    CREATE POLICY "own money facts" ON public.money_facts FOR ALL USING (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'money_questions_asked' AND policyname = 'own questions asked') THEN
    CREATE POLICY "own questions asked" ON public.money_questions_asked FOR ALL USING (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text);
  END IF;
END $$;
