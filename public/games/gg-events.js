/* Event bridge: receives outcomes from game logic, never timers or raw input. */
(() => {
  if (window.GGLounge) return;
  const game = location.pathname.split('/')[2];
  const values = new Map();
  let targets = [];
  const sent = new Set();
  function flush(metric) {
    const value = values.get(metric);
    const crossed = targets.filter(a => a.metric === metric && value >= a.target && !sent.has(a.slug));
    if (!crossed.length) return;
    crossed.forEach(a => sent.add(a.slug));
    parent.postMessage({ type: 'gg:gameplay', game, metric, value }, location.origin);
  }
  window.GGLounge = Object.freeze({
    emit(metric, value) {
      if (!Number.isFinite(value) || value < 0 || parent === window) return;
      values.set(metric, Math.max(values.get(metric) || 0, value));
      flush(metric);
    }
  });
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'gg:connect' || event.data.game !== game || !Array.isArray(event.data.targets)) return;
    targets = event.data.targets;
    values.forEach((_, metric) => flush(metric));
  });
  if (parent !== window) parent.postMessage({ type: 'gg:ready', game }, location.origin);
})();
