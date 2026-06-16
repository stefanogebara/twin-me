-- Recurring reminders (2026-06-16): an optional recurrence turns a one-shot
-- reminder into a repeating one. NULL = one-shot (existing behavior). On
-- delivery, deliverDueReminders advances remind_at to the next occurrence and
-- keeps status 'pending' instead of marking it terminally delivered.
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence TEXT;

COMMENT ON COLUMN reminders.recurrence IS
  'NULL = one-shot. Recurring: daily | weekdays | weekly | monthly. On delivery, remind_at advances to the next occurrence and status stays pending.';
