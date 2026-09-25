/** Pure fail-closed policy shared by every financial conclusion. Recorded ledger rows and
 * dated bank balances remain available; unresolved observations are never counted as zero. */
import { dayIn } from './zone.js';

export function financialEvidenceBlocked(reconciliation) {
  return !reconciliation || reconciliation.state !== 'clear';
}
export function financialEvidenceReason(reconciliation, language = 'en') {
  const pending = reconciliation?.state === 'pending';
  if (language === 'es') return pending
    ? 'Hay observaciones de pagos pendientes de revisión. Los pagos registrados no incluyen esas observaciones; el gasto total y las previsiones están incompletos. Revísalas en Fuentes.'
    : 'No se ha podido comprobar si los pagos están completos. Las previsiones y el importe disponible están pausados. Vuelve a intentarlo en Fuentes.';
  if (language === 'pt-BR' || language === 'pt') return pending
    ? 'Há observações de pagamentos para rever. Os pagamentos registados não incluem essas observações; o gasto total e as previsões estão incompletos. Reveja-as em Fontes.'
    : 'Não foi possível verificar se os pagamentos estão completos. As previsões e o valor disponível estão suspensos. Tente novamente em Fontes.';
  return pending
    ? 'Payment observations need review. Recorded payments exclude those observations, so spending totals and forecasts are incomplete. Review them in Sources.'
    : 'Payment completeness could not be checked. Forecasts and spending guidance are paused. Try again in Sources.';
}
export function withheldForecast(reconciliation, now = new Date()) {
  const today = dayIn(now);
  return {
    withheld: true, reconciliation, why: financialEvidenceReason(reconciliation),
    as_of: today, month: `${today.slice(0, 7)}-01`, days_left: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate() - Number(today.slice(8, 10)),
    spent: null, committed: null, projected_p10: null, projected_p50: null, projected_p90: null,
    income: null, net: null, calendar_ahead: null, weekday_baseline: null, band_calibration: null,
    days: null, tomorrow: null, committed_items: [], commitment_items: [], expected_items: [], income_items: [], calendar_items: [],
  };
}
export function withheldReply(reconciliation, language = 'en') {
  return { text: financialEvidenceReason(reconciliation, language), figures: [], actions: [], receipts: [], basis: [], next: [], computed: true, reconciliation };
}
