/**
 * Generate self-contained HTML dashboard from autoresearch results.
 */

export function generateDashboard(targetName, scores, changelog, baselinePrompt, bestPrompt) {
  const maxScore = Math.max(...scores.map(s => s.score));
  const barWidth = 40;

  const scoreChart = scores.map((s, i) => {
    const pct = Math.round(s.score * 100);
    const barH = Math.round(s.score * 200);
    const color = s.kept === false ? '#ef4444' : s.score >= 0.9 ? '#10b981' : '#e5e5e5';
    const label = i === 0 ? 'Base' : `R${i}`;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <span style="font-size:11px;color:#999">${pct}%</span>
      <div style="width:${barWidth}px;height:${barH}px;background:${color};border-radius:4px 4px 0 0;min-height:4px"></div>
      <span style="font-size:10px;color:#666">${label}</span>
    </div>`;
  }).join('');

  const changelogHTML = changelog.map((c, i) => {
    const icon = c.kept ? '<span style="color:#10b981">KEPT</span>' : '<span style="color:#ef4444">REVERTED</span>';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #222">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #222">${icon}</td>
      <td style="padding:8px;border-bottom:1px solid #222;font-size:13px">${escapeHtml(c.change)}</td>
      <td style="padding:8px;border-bottom:1px solid #222">${Math.round((c.scoreBefore || 0) * 100)}% -> ${Math.round((c.scoreAfter || 0) * 100)}%</td>
    </tr>`;
  }).join('');

  // Criterion pass rate heatmap
  const criteriaIds = scores[0]?.criterionPassRates ? Object.keys(scores[0].criterionPassRates) : [];
  const heatmapRows = criteriaIds.map(cId => {
    const cells = scores.map(s => {
      const rate = s.criterionPassRates?.[cId] ?? 0;
      const bg = rate >= 1 ? '#10b981' : rate >= 0.5 ? '#C9B99A' : '#ef4444';
      return `<td style="width:30px;height:24px;background:${bg};border:1px solid #111;text-align:center;font-size:10px;color:#fff">${Math.round(rate * 100)}</td>`;
    }).join('');
    return `<tr><td style="padding:4px 8px;font-size:11px;color:#999;white-space:nowrap">C${cId}</td>${cells}</tr>`;
  }).join('');

  const baselineScore = Math.round((scores[0]?.score || 0) * 100);
  const bestScore = Math.round(maxScore * 100);
  const totalCost = scores.reduce((sum, s) => sum + (s.cost || 0), 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Autoresearch: ${escapeHtml(targetName)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px}
.container{max-width:900px;margin:0 auto}
h1{font-size:24px;font-weight:600;margin-bottom:8px}
.subtitle{color:#666;margin-bottom:32px;font-size:14px}
.stats{display:flex;gap:32px;margin-bottom:32px}
.stat{text-align:center}
.stat-value{font-size:36px;font-weight:700;font-variant-numeric:tabular-nums}
.stat-label{font-size:12px;color:#666;margin-top:4px}
.card{background:#1a1a1a;border:1px solid #222;border-radius:12px;padding:24px;margin-bottom:24px}
.card h2{font-size:16px;margin:0 0 16px 0;color:#999}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:12px;color:#666}
</style></head><body>
<div class="container">
<h1>Autoresearch: ${escapeHtml(targetName)}</h1>
<p class="subtitle">Karpathy-style hill-climbing prompt optimization</p>

<div class="stats">
  <div class="stat"><div class="stat-value" style="color:#e5e5e5">${baselineScore}%</div><div class="stat-label">Baseline</div></div>
  <div class="stat"><div class="stat-value" style="color:#10b981">${bestScore}%</div><div class="stat-label">Best</div></div>
  <div class="stat"><div class="stat-value" style="color:#e5e5e5">+${bestScore - baselineScore}%</div><div class="stat-label">Improvement</div></div>
  <div class="stat"><div class="stat-value" style="color:#666">${scores.length - 1}</div><div class="stat-label">Rounds</div></div>
  <div class="stat"><div class="stat-value" style="color:#666">$${totalCost.toFixed(3)}</div><div class="stat-label">Cost</div></div>
</div>

<div class="card">
  <h2>Score Progression</h2>
  <div style="display:flex;align-items:flex-end;gap:4px;height:220px;padding-top:20px">
    ${scoreChart}
  </div>
</div>

<div class="card">
  <h2>Criterion Pass Rates (green=100%, yellow=50%+, red=&lt;50%)</h2>
  <div style="overflow-x:auto">
    <table>${heatmapRows}</table>
  </div>
</div>

<div class="card">
  <h2>Changelog</h2>
  <table>
    <tr><th>Round</th><th>Status</th><th>Change</th><th>Score</th></tr>
    ${changelogHTML}
  </table>
</div>

</div></body></html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
