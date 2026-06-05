/**
 * One-line formatter for Gmail behavioral analytics — same directive
 * framing as the other platforms.
 */

function maskAddress(email) {
  // Keep the local-part short + the full domain so the system prompt
  // doesn't leak full addresses but the twin can still ground "you
  // emailed jane@google.com" style references where the user
  // explicitly asks about a contact.
  if (!email) return '?';
  return email;
}

export function formatEmailBehavior(behavior) {
  if (!behavior || !behavior.volume) return null;
  const { period, volume, chronotype, top_recipients, top_senders, labels } = behavior;
  const days = period?.days ?? '?';

  if (volume.sent === 0 && volume.received === 0) {
    return `Gmail over the last ${days} days: 0 sent, 0 received.`;
  }

  const ratio = volume.sent_to_received_ratio != null ? `, ratio ${volume.sent_to_received_ratio}` : '';
  const volumeLine = `${volume.sent} sent, ${volume.received} received${ratio}, active ${volume.active_days_sending}/${days} days`;

  const recipientLine = (top_recipients ?? [])
    .slice(0, 5)
    .map((r) => `${maskAddress(r.email)} ×${r.count}`)
    .join(', ');
  const senderLine = (top_senders ?? [])
    .slice(0, 5)
    .map((s) => `${maskAddress(s.email)} ×${s.count}`)
    .join(', ');

  const chrono = chronotype ?? {};
  const topHoursLine = (chrono.top_hours_utc ?? [])
    .map((b) => `${String(b.hour).padStart(2, '0')}:00×${b.count}`)
    .join(', ');
  const chronotypeFlag =
    chrono.night_owl_pct >= 25
      ? ` (night-owl: ${chrono.night_owl_pct}% of sends 22:00-04:00 UTC)`
      : chrono.early_bird_pct >= 25
        ? ` (early-bird: ${chrono.early_bird_pct}% of sends 04:00-08:00 UTC)`
        : '';
  const chronoLine = topHoursLine ? `Top send hours (UTC): ${topHoursLine}${chronotypeFlag}.` : '';

  const labelLine =
    labels?.custom_label_count > 0
      ? `Custom labels: ${labels.custom_label_count} (top: ${(labels.top_labels ?? [])
          .map((l) => l.name)
          .join(', ')}).`
      : 'No custom labels — inbox is unstructured.';

  const parts = [
    `Gmail over the last ${days} days: ${volumeLine}.`,
    chronoLine,
    recipientLine && `Top recipients: ${recipientLine}.`,
    senderLine && `Top senders into inbox: ${senderLine}.`,
    labelLine,
  ].filter(Boolean);

  return parts.join(' ');
}
