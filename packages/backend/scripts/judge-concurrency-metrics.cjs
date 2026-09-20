function summarizeWave(size, expectedCases, rows) {
  const events = rows.flatMap(r => [[r.started, 1], [r.finished, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, peakActive = 0;
  for (const [, delta] of events) peakActive = Math.max(peakActive, active += delta);
  const verdictPass = rows.length === size && rows.every(r => r.status === 'ACCEPTED' && r.score === 100 && r.cases === expectedCases && r.taskFinished);
  // Redis producer/worker clocks can differ slightly; retain raw signed deltas in reports.
  const latencyPass = rows.length === size && rows.every(r => Number.isFinite(r.queueMs) && r.queueMs >= -1000 && r.queueMs < 2000
    && Number.isFinite(r.started) && Number.isFinite(r.finished) && r.finished > r.started);
  const concurrencyPass = peakActive === size;
  return { size, expectedCases, peakActive, verdictPass, latencyPass, concurrencyPass, pass: verdictPass && latencyPass && concurrencyPass, rows };
}
module.exports = { summarizeWave };
