'use client';

/**
 * The Arcade Lab — one panel, ten experiments.
 *
 * Every module is independent: turning one on does not require another, and
 * turning one off restores what it changed. The panel itself is a popover with
 * a real tab list, because ten toggles in a row is a settings page nobody reads.
 *
 * It is mounted by the game launcher and only exists while a game is open,
 * except for the mesh panel, which is available anywhere (a dead mirror is not
 * a per-game problem).
 */

import { useEffect, useMemo, useState } from 'react';
import { Beaker, Dice5, Download, Sparkles, X } from 'lucide-react';
import { ModMenu } from './ModMenu';
import { Rewind } from './Rewind';
import { VoiceControl } from './VoiceControl';
import { Vault } from './Vault';
import { PrivacyAngle, TabRunner, TabRunnerToggle } from './PrivacyTab';
import { GhostHum } from './GhostHum';
import { MirrorMesh } from './MirrorMesh';
import { Ambilight } from './Ambilight';
import { generateGame } from '@/lib/micro-game';
import { download } from './engine';
import { useSetting } from './use-setting';
import { setSetting } from './engine';

type Tab = 'mods' | 'rewind' | 'voice' | 'vault' | 'scene' | 'lab' | 'mesh';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'mods', label: 'Mods', hint: 'Time scale and look filters' },
  { id: 'rewind', label: 'Rewind', hint: 'Replay the last nine seconds' },
  { id: 'voice', label: 'Voice', hint: 'Commands and auto-panic' },
  { id: 'vault', label: 'Vault', hint: 'Hide a message in a PNG' },
  { id: 'scene', label: 'Scene', hint: 'Privacy angle, ambilight, ghost hum' },
  { id: 'lab', label: 'Lab', hint: 'Generate a micro-game' },
  { id: 'mesh', label: 'Mesh', hint: 'Which mirrors are up' },
];

export function ArcadeLab({
  frame,
  wrap,
  chrome = true,
}: {
  frame: () => HTMLIFrameElement | null;
  /** Lazy, for the same reason as `frame`: the element mounts after this one. */
  wrap: () => HTMLElement | null;
  /** The launcher passes false on pages with no game open. */
  chrome?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('mods');
  const ambilight = useSetting('ambilight', false);
  const rewindOn = useSetting('rewindOn', false);
  const [generated, setGenerated] = useState(() => generateGame());

  // The panel is a popover, so Escape closes it and focus returns to the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  /**
   * The lab's own game opens in a new tab rather than replacing the one being
   * played: a generated game is a thing to try, not a thing to lose your
   * current run to.
   */
  const launchGenerated = useMemo(() => () => {
    const blob = new Blob([generated.document], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // The new tab owns the blob now; revoke on the next tick so a slow popup
    // does not get a dead URL, and the memory is still reclaimed.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [generated]);

  return (
    <div className="gglab">
      {ambilight && <Ambilight frame={frame} host={wrap} />}

      <button
        type="button"
        className={`gglab-trigger${open ? ' on' : ''}`}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="gg-arcade-lab"
        title="Arcade Lab — ten experiments"
      >
        <Beaker size={15} />
        <span>Lab</span>
      </button>

      {open && (
        <div className="gglab-panel-box" id="gg-arcade-lab" role="dialog" aria-label="Arcade Lab">
          <header>
            <span className="gglab-title"><Sparkles size={13} /> Arcade Lab</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Arcade Lab"><X size={15} /></button>
          </header>

          <div className="gglab-tabs" role="tablist" aria-label="Experiments">
            {TABS.map(entry => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={tab === entry.id ? 'on' : ''}
                title={entry.hint}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="gglab-body" role="tabpanel">
            {tab === 'mods' && (
              <>
                <ModMenu frame={frame} />
                {!chrome && <p className="gglab-note">Open a game to use modifiers — there is no frame to modify yet.</p>}
              </>
            )}

            {tab === 'rewind' && (
              <div className="gglab-rewind-wrap">
                <div className="gglab-row">
                  <button
                    type="button"
                    className={rewindOn ? 'on' : ''}
                    onClick={() => setSetting('rewindOn', !rewindOn)}
                  >
                    Record buffer
                  </button>
                  <span className="gglab-count">9 s · 30 frames</span>
                </div>
                <Rewind target={frame()} />
              </div>
            )}

            {tab === 'voice' && <VoiceControl />}

            {tab === 'vault' && <Vault />}

            {tab === 'scene' && (
              <>
                <TabRunner />
                <PrivacyAngle />
                <div className="gglab-row">
                  <button
                    type="button"
                    className={ambilight ? 'on' : ''}
                    onClick={() => setSetting('ambilight', !ambilight)}
                    title="Glow the edges of the frame with the game's own colours"
                  >
                    Ambilight
                  </button>
                  <TabRunnerToggle />
                  <GhostHum />
                </div>
                <p className="gglab-note">
                  Privacy narrows the visible cone as you move away from the centre; ambilight samples the game
                  at 15 fps; the tab runner draws a tiny game into the favicon and the title.
                </p>
              </>
            )}

            {tab === 'lab' && (
              <>
                <div className="gglab-idea">
                  <strong>{generated.title}</strong>
                  <span>{generated.kind} · difficulty {generated.difficulty} · seed {generated.seed}</span>
                </div>
                <div className="gglab-row">
                  <button type="button" className="on" onClick={launchGenerated}>
                    <Sparkles size={13} /> Play it
                  </button>
                  <button type="button" onClick={() => setGenerated(generateGame())}>
                    <Dice5 size={13} /> New seed
                  </button>
                  <button
                    type="button"
                    onClick={() => download(new Blob([generated.document], { type: 'text/html' }), `${generated.id}.html`)}
                  >
                    <Download size={13} /> Save .html
                  </button>
                </div>
                <p className="gglab-note">
                  A complete game — canvas, loop, collision, palette and title — generated from the seed.
                  Every seed is a different game, and the file you save runs on its own.
                </p>
              </>
            )}

            {tab === 'mesh' && <MirrorMesh />}
          </div>

          <style>{`
            .gglab{position:relative;display:inline-flex}
            .gglab-trigger{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:10px;
              border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--foreground);
              font:800 11.5px/1 system-ui,sans-serif;cursor:pointer;letter-spacing:.02em}
            .gglab-trigger.on{border-color:var(--lime);background:var(--lime);color:#0b0d12}
            .gglab-panel-box{position:absolute;right:0;top:calc(100% + 8px);z-index:2147481500;width:min(420px,94vw);
              max-height:min(70vh,620px);overflow:auto;background:#0d1018;border:1px solid var(--line);
              border-radius:16px;box-shadow:0 26px 60px rgba(0,0,0,.6);font-size:12.5px}
            .gglab-panel-box>header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
            .gglab-title{display:inline-flex;align-items:center;gap:6px;flex:1;font:900 11px/1 system-ui,sans-serif;
              letter-spacing:.08em;text-transform:uppercase;color:var(--lime)}
            .gglab-panel-box>header button{border:0;background:transparent;color:inherit;opacity:.7;cursor:pointer;
              width:26px;height:26px;border-radius:8px;display:grid;place-items:center}
            .gglab-panel-box>header button:hover{opacity:1;background:rgba(255,255,255,.08)}
            .gglab-tabs{display:flex;gap:2px;padding:8px 10px 0;flex-wrap:wrap}
            .gglab-tabs button{border:0;background:transparent;color:inherit;opacity:.55;font:800 11px/1 system-ui,sans-serif;
              padding:6px 9px;border-radius:8px;cursor:pointer}
            .gglab-tabs button.on{opacity:1;background:rgba(190,242,100,.14);color:var(--lime)}
            .gglab-body{padding:10px 12px 14px;display:flex;flex-direction:column;gap:9px}
            .gglab-panel{display:flex;flex-direction:column;gap:8px}
            .gglab-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
            .gglab-label{display:inline-flex;align-items:center;gap:5px;font:800 10.5px/1 system-ui,sans-serif;
              letter-spacing:.06em;text-transform:uppercase;opacity:.6;min-width:64px}
            .gglab-body button{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);
              background:rgba(255,255,255,.05);color:inherit;border-radius:8px;padding:5px 9px;
              font:700 11.5px/1 system-ui,sans-serif;cursor:pointer}
            .gglab-body button:hover{background:rgba(255,255,255,.1)}
            .gglab-body button.on{border-color:var(--lime);background:rgba(190,242,100,.16);color:var(--lime)}
            .gglab-body button:disabled{opacity:.4;cursor:default}
            .gglab-scales,.gglab-filters{display:flex;gap:3px;flex-wrap:wrap}
            .gglab-count{font:700 10.5px/1 ui-monospace,monospace;opacity:.5;display:inline-flex;align-items:center;gap:4px}
            .gglab-note{margin:0;font-size:11.5px;line-height:1.5;opacity:.65}
            .gglab-note.err{color:#ffb4b8;opacity:1}
            .gglab-note.ok{color:var(--lime);opacity:.9}
            .gglab-toggle{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);
              background:rgba(255,255,255,.05);color:inherit;border-radius:8px;padding:5px 9px;
              font:700 11.5px/1 system-ui,sans-serif;cursor:pointer}
            .gglab-toggle.on{border-color:var(--lime);background:rgba(190,242,100,.16);color:var(--lime)}
            .gglab-meter{width:26px;height:4px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden;position:relative}
            .gglab-meter::after{content:'';position:absolute;inset:0;width:calc(var(--v,0)*100%);background:var(--lime)}
            .gglab-heard{font:700 11px/1.4 ui-monospace,monospace;opacity:.75}
            .gglab-rewind-wrap{position:relative;display:flex;flex-direction:column;gap:8px}
            .gglab-rewind{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:3}
            .gglab-idea{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;
              background:linear-gradient(135deg,rgba(190,242,100,.12),rgba(125,211,255,.08));border:1px solid var(--line)}
            .gglab-idea strong{font-size:14px}
            .gglab-idea span{font:700 10.5px/1.4 ui-monospace,monospace;opacity:.6}
            .gglab-vault{display:flex;flex-direction:column;gap:8px}
            .gglab-vault-field{display:flex;flex-direction:column;gap:4px;font:800 10.5px/1 system-ui,sans-serif;
              letter-spacing:.06em;text-transform:uppercase;opacity:.75}
            .gglab-vault-field>span{display:inline-flex;align-items:center;gap:5px}
            .gglab-vault-input{display:flex;gap:4px}
            .gglab-vault-input input{flex:1;min-width:0;border:1px solid var(--line);background:rgba(0,0,0,.35);
              color:inherit;border-radius:8px;padding:7px 9px;font:600 12px/1 system-ui,sans-serif;text-transform:none;letter-spacing:0}
            .gglab-mesh ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
            .gglab-mesh li{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:8px;
              background:rgba(255,255,255,.04);font:600 11.5px/1.3 ui-monospace,monospace}
            .gglab-mesh li.down{background:rgba(174,89,96,.12);color:#ffc3c7}
            .gglab-mesh-host{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .gglab-mesh-host em{opacity:.55;font-style:normal}
            .gglab-mesh-ms{opacity:.6;font-size:10.5px}
            .gglab-mesh a{color:var(--lime);text-decoration:none;font-weight:800}
            .gglab-primary{padding:5px 10px;border-radius:8px;background:var(--lime);color:#0b0d12;
              font:800 11.5px/1 system-ui,sans-serif;text-decoration:none;display:inline-flex;align-items:center}
            .gglab-bubble-toggle{position:fixed;right:16px;bottom:88px;z-index:2147481000;display:inline-flex;
              align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid var(--line);
              background:rgba(13,16,24,.94);color:inherit;font:800 11.5px/1 system-ui,sans-serif;cursor:pointer}
            .gglab-bubble-toggle.on{border-color:var(--lime);color:var(--lime)}
            .gglab-bubble{position:fixed;z-index:2147481200;width:148px;height:148px;border-radius:50%;overflow:hidden;
              border:2px solid var(--lime);box-shadow:0 18px 40px rgba(0,0,0,.5);cursor:grab;background:#05070b}
            .gglab-bubble.big{width:260px;height:260px}
            .gglab-bubble video{width:100%;height:100%;object-fit:cover;display:block}
            .gglab-bubble-wait{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;
              justify-content:center;gap:6px;font:700 10.5px/1.3 system-ui,sans-serif;opacity:.7;text-align:center;padding:10px}
            .gglab-bubble-actions{position:absolute;bottom:6px;right:6px;display:flex;gap:2px}
            .gglab-bubble-actions button{width:20px;height:20px;border-radius:50%;border:0;
              background:rgba(0,0,0,.65);color:#fff;display:grid;place-items:center;cursor:pointer}
            /* ---- CRT + privacy + ambilight overlays ---- */
            .gg-crt-on{position:relative}
            .gg-crt-on::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:4;border-radius:14px;
              background:repeating-linear-gradient(180deg,rgba(255,255,255,.05) 0 1px,transparent 1px 3px);
              mix-blend-mode:overlay}
            html.gg-privacy-on .gg-split-area::after,
            html.gg-privacy-on .game-modal::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;
              background:radial-gradient(circle at var(--gg-privacy-x,50%) var(--gg-privacy-y,50%),
                transparent calc(46% - var(--gg-privacy,0) * 9%), rgba(0,0,0,.92) calc(72% - var(--gg-privacy,0) * 8%))}
            .gg-ambilight-on{position:relative}
            .gg-ambilight-on::before{content:'';position:absolute;inset:-18px;border-radius:24px;z-index:-1;filter:blur(26px);
              pointer-events:none;opacity:.85;background:
                radial-gradient(60% 40% at 50% 0%,var(--gg-amb-top,rgba(190,242,100,.4)),transparent 70%),
                radial-gradient(60% 40% at 50% 100%,var(--gg-amb-bottom,rgba(125,211,255,.4)),transparent 70%),
                radial-gradient(40% 60% at 0% 50%,var(--gg-amb-left,rgba(190,242,100,.3)),transparent 70%),
                radial-gradient(40% 60% at 100% 50%,var(--gg-amb-right,rgba(125,211,255,.3)),transparent 70%)}
          `}</style>
        </div>
      )}
    </div>
  );
}
