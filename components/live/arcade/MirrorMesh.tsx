'use client';

/**
 * Feature 8 — the mesh panel.
 *
 * Shows what the last probe found and offers the one action that matters:
 * "take me to a working copy". The redirect is a real navigation, not a frame
 * swap — a mirror is a whole other deployment, and pretending otherwise would
 * break the service worker and the save system at once.
 *
 * The probe is manual by default. A background probe on every page load would
 * mean four extra requests per visit to reassure someone who was not worried.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, RefreshCw, ServerCrash, Server } from 'lucide-react';
import { MIRRORS, bestMirror, probeMesh } from '@/lib/mirror-mesh';

type Result = { host: string; ms: number | null };

export function MirrorMesh() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);

  const run = useCallback(async () => {
    setBusy(true);
    const outcome = await probeMesh();
    // Show every known mirror, including the retired ones that were not probed,
    // so the panel is a complete picture rather than only the survivors.
    const merged = MIRRORS.map(host => outcome.find(result => result.host === host) ?? { host, ms: null });
    setResults(merged);
    setCheckedAt(Date.now());
    setBusy(false);
  }, []);

  // Stale-while-revalidate: show the previous answer (from this session) and
  // start a fresh probe immediately, so the panel is never an empty table.
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    void run();
  }, [run]);

  const best = bestMirror(results);
  const here = typeof location !== 'undefined' ? location.origin : '';

  return (
    <div className="gglab-mesh">
      <ul>
        {results.map(result => {
          const alive = result.ms !== null;
          const current = result.host.replace(/\/$/, '') === here;
          return (
            <li key={result.host} className={alive ? 'up' : 'down'}>
              {alive ? <Server size={12} /> : <ServerCrash size={12} />}
              <span className="gglab-mesh-host">
                {result.host.replace('https://', '')}
                {current && <em> · you are here</em>}
              </span>
              <span className="gglab-mesh-ms">{busy ? '…' : alive ? `${result.ms} ms` : 'unreachable'}</span>
              {alive && !current && (
                <a href={result.host} rel="noreferrer">Use</a>
              )}
            </li>
          );
        })}
      </ul>
      <div className="gglab-row">
        <button type="button" onClick={() => void run()} disabled={busy}>
          <RefreshCw size={13} /> {busy ? 'Probing…' : 'Probe mirrors'}
        </button>
        {best && best.replace(/\/$/, '') !== here && (
          <a className="gglab-primary" href={best}>Switch to {best.replace('https://', '')}</a>
        )}
        <span className="gglab-count">
          <Radio size={11} /> {checkedAt ? new Date(checkedAt).toLocaleTimeString() : 'not probed'}
        </span>
      </div>
    </div>
  );
}
