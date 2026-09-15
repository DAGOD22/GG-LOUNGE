"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Ban,
  Blend,
  Check,
  MousePointerClick,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  Gauge,
  Image as ImageIcon,
  Keyboard,
  MonitorSmartphone,
  Palette,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Shield,
  Sliders,
  Sparkles,
  Upload,
  Wind,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ types -- */

type Cloak = {
  enabled: boolean;
  preset: string;
  name: string;
  icon: string;
  iconMode: "preset" | "url" | "letter";
  letter: string;
  color: string;
  appCloak: boolean;
  aboutBlank: boolean;
  autoCloak: boolean;
  hideUrlHint: boolean;
};
type Panic = {
  enabled: boolean;
  key: string;
  alt: string;
  requireModifier: boolean;
  modifier: string;
  target: string;
  url: string;
  mode: "replace" | "newtab" | "fake";
  backGuard: boolean;
  panicOnBlur: boolean;
  blurDelay: number;
  fakeTitle: string;
};
type Theme = {
  id: string;
  accent: string;
  bg: string;
  text: string;
  radius: number;
  surface: string;
  font: string;
  glow: number;
  dim: number;
  scale: number;
};
type Bg = {
  id: string;
  intensity: number;
  speed: number;
  cursor: string;
  keyboard: string;
  opacity: number;
  blur: number;
  dim: number;
  loop: boolean;
  muted: boolean;
  customUrl: string;
  customKind: string;
};
type Video = {
  schoolMode: boolean;
  strictImg: boolean;
  provider: string;
  instance: string;
  region: string;
  quality: string;
  engine: string;
  autoplay: boolean;
  skipSponsors: boolean;
  captions: boolean;
  volume: number;
};
type Ui = { showSettingsFab: boolean; compactCards: boolean; reduceMotion: boolean; hideHeaderLinks: boolean };
type Settings = { v: number; cloak: Cloak; panic: Panic; theme: Theme; bg: Bg; video: Video; ui: Ui };

type GGApi = {
  get: () => Settings;
  set: (patch: Partial<Settings>) => Settings;
  patch: <K extends keyof Settings>(section: K, values: Partial<Settings[K]>) => Settings;
  presets: {
    cloaks: { id: string; name: string; short: string; icon: string; tint: string; note?: string }[];
    panicTargets: { id: string; name: string; url: string; icon: string }[];
    themes: {
      id: string; name: string; tag: string; accent: string; accent2: string; bg: string; text: string;
      panel: string; bgMode: string; surface: string; font: string; glow: number;
    }[];
    backgrounds: {
      id: string; name: string; kind: string; tag: string; desc?: string; url?: string; poster?: string; grad?: string;
    }[];
  };
  theme: () => { accent: string; bg: string; text: string; muted: string };
  cloakValues: () => { name: string; icon: string };
  panic: () => void;
  panicTarget: () => string;
  cloakNow: (url?: string) => Window | null;
  showFake: () => void;
  install: () => Promise<{ ok: boolean; needsManual?: boolean }>;
  canInstall: () => boolean;
  isStandalone: () => boolean;
  reset: () => Settings;
  export: () => string;
  import: (raw: string) => Settings;
  reseedBackground: () => void;
  setThemeBackground: (themeId: string) => Settings;
  subscribe: (fn: (s: Settings) => void) => () => void;
  storageKey: string;
  defaults: () => Settings;
};

declare global {
  interface Window {
    GG?: GGApi;
  }
}

const SECTIONS = [
  { id: "cloak", label: "Tab Cloak", icon: Eye },
  { id: "panic", label: "Panic Key", icon: Zap },
  { id: "theme", label: "Themes", icon: Palette },
  { id: "background", label: "Backgrounds", icon: Blend },
  { id: "video", label: "Video Engine", icon: Activity },
  { id: "data", label: "Profiles & Data", icon: Save },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/* ------------------------------------------------------------------ hook --- */

function useGG() {
  const [gg, setGg] = useState<GGApi | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    let tries = 0;
    const find = () => {
      if (window.GG) {
        setGg(window.GG);
        setS(window.GG.get());
        return;
      }
      if (++tries < 40) setTimeout(find, 50);
    };
    find();
    const onReady = () => {
      if (window.GG) {
        setGg(window.GG);
        setS(window.GG.get());
      }
    };
    document.addEventListener("gg:ready", onReady);
    const unsub = window.GG ? window.GG.subscribe((next) => setS(next as Settings)) : undefined;
    return () => {
      document.removeEventListener("gg:ready", onReady);
      unsub?.();
    };
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      if (!window.GG) return;
      setS(window.GG.set(patch) as Settings);
    },
    [],
  );
  const patch = useCallback(
    <K extends keyof Settings>(section: K, values: Partial<Settings[K]>) => {
      if (!window.GG) return;
      setS(window.GG.patch(section, values) as Settings);
    },
    [],
  );
  return { gg, s, update, patch };
}

/* ------------------------------------------------------------- controls -- */

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`gg-switch${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <label className="gg-slider">
      <span>
        {label}
        <b>{format ? format(value) : Math.round(((value - min) / (max - min)) * 100) + "%"}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gg-field">
      <div className="gg-field-head">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="gg-field-body">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      className={`gg-input${mono ? " mono" : ""}`}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; desc?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="gg-choices">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`gg-choice${value === o.id ? " active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          <b>{o.label}</b>
          {o.desc ? <small>{o.desc}</small> : null}
        </button>
      ))}
    </div>
  );
}

/** A fake browser tab so cloaking is visible before you try it. */
function TabPreview({ name, icon, active }: { name: string; icon?: string; active?: boolean }) {
  return (
    <div className={`gg-tab${active ? " active" : ""}`}>
      {icon ? (
        <img src={icon} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
      ) : (
        <span className="gg-tab-dot" />
      )}
      <span className="gg-tab-name">{name || "Untitled"}</span>
      <span className="gg-tab-x">×</span>
    </div>
  );
}

/* ------------------------------------------------------------------ page --- */

export default function SettingsPage() {
  const { gg, s, patch } = useGG();
  const [section, setSection] = useState<SectionId>("cloak");
  const [toast, setToast] = useState("");
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  /* Panic keys are owned by gg-boot.js so they behave identically in every room;
     use the "Test panic" button below to try one from here. */

  if (!gg || !s) {
    return (
      <main className="settings-shell">
        <div className="settings-loading">
          <span className="gg-spinner" /> Loading your lounge profile…
        </div>
      </main>
    );
  }

  const t = gg.theme();

  return (
    <main className="settings-shell" data-gg-settings>
      <header className="settings-head">
        <a className="settings-back" href="/">
          <ArrowLeft size={15} /> Lounge
        </a>
        <div>
          <p className="eyebrow">
            <Settings2 size={14} /> GG-LOUNGE™ CONTROL ROOM
          </p>
          <h1>
            Settings<span>.</span>
          </h1>
          <p className="settings-sub">
            Cloak the tab, arm a panic key, restyle the whole lounge, and pick which video engine feeds YouTube
            and TikTok. Saved to this browser only — nothing leaves your machine.
          </p>
        </div>
        <div className="settings-head-actions">
          <button className="gg-btn" onClick={() => flash("Applied to every open lounge tab")}>
            <Check size={14} /> Saved
          </button>
        </div>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
          <div className="settings-nav-note">
            <Shield size={14} />
            <span>
              Presets are tuned for school Wi-Fi: everything is fetched by the lounge server, so your browser
              never touches a blocked domain.
            </span>
          </div>
        </nav>

        <div className="settings-panels">
          {section === "cloak" ? <CloakPanel gg={gg} s={s} patch={patch} flash={flash} accent={t.accent} /> : null}
          {section === "panic" ? <PanicPanel gg={gg} s={s} patch={patch} flash={flash} /> : null}
          {section === "theme" ? <ThemePanel gg={gg} s={s} patch={patch} flash={flash} /> : null}
          {section === "background" ? <BgPanel gg={gg} s={s} patch={patch} flash={flash} /> : null}
          {section === "video" ? <VideoPanel s={s} patch={patch} flash={flash} /> : null}
          {section === "data" ? <DataPanel gg={gg} s={s} patch={patch} flash={flash} /> : null}
        </div>
      </div>

      <footer className="settings-foot">
        <span>
          GG-LOUNGE STUDIOS™ · profile v{s.v} · accent {t.accent}
        </span>
        <span>
          Tip: the panic key and cloak work inside the YouTube and TikTok rooms too.
        </span>
      </footer>

      {toast ? <div className="gg-toast">{toast}</div> : null}
    </main>
  );
}

/* --------------------------------------------------------------- cloak ----- */

function CloakPanel({
  gg,
  s,
  patch,
  flash,
  accent,
}: {
  gg: GGApi;
  s: Settings;
  patch: <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => void;
  flash: (m: string) => void;
  accent: string;
}) {
  const c = s.cloak;
  const presets = gg.presets.cloaks;
  const live = useMemo(() => {
    try {
      return gg.cloakValues();
    } catch {
      return { name: c.name || "", icon: "" };
    }
  }, [c, gg]);

  function pick(id: string) {
    const p = presets.find((x) => x.id === id);
    patch("cloak", {
      preset: id,
      name: id === "custom" ? c.name : "",
      icon: p?.icon || c.icon,
      iconMode: id === "custom" ? c.iconMode : "preset",
      color: p?.tint || c.color,
    });
  }

  return (
    <>
      <section className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-icon">
            <Eye size={18} />
          </span>
          <div>
            <h2>Tab cloaking</h2>
            <p>Rename the tab and swap the favicon. Presets cover the usual suspects, or write your own.</p>
          </div>
          <Switch on={c.enabled} onChange={(v) => patch("cloak", { enabled: v })} label="Enable tab cloaking" />
        </div>

        <div className="gg-live-preview">
          <div className="gg-browser">
            <div className="gg-browser-top">
              <TabPreview name={c.enabled ? live.name : "GG-Lounge — Small games. Big energy."} icon={c.enabled ? live.icon : undefined} active />
              <div className="gg-browser-bar">
                <span className="gg-lock">🔒</span>
                {c.aboutBlank ? "about:blank" : typeof window !== "undefined" ? window.location.host : ""}
              </div>
            </div>
            <div className="gg-browser-body" style={{ background: `linear-gradient(140deg,${accent}22,transparent)` }}>
              <span>this is exactly what the teacher sees</span>
            </div>
          </div>
        </div>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">Presets</h3>
        <div className="gg-preset-grid">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`gg-preset${c.preset === p.id ? " active" : ""}`}
              onClick={() => pick(p.id)}
              title={p.note || p.name}
            >
              <span className="gg-preset-icon" style={{ background: p.tint + "22", borderColor: p.tint + "66" }}>
                {p.icon ? <img src={`/api/img?url=${encodeURIComponent(p.icon)}`} alt="" loading="lazy" /> : <b>{p.name.charAt(0)}</b>}
              </span>
              <span className="gg-preset-name">{p.name.length > 34 ? p.name.slice(0, 33) + "…" : p.name}</span>
              {c.preset === p.id ? <Check size={14} className="gg-preset-check" /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">Custom tab</h3>
        <Field label="Tab name" hint="Shown in the tab strip, bookmarks and the app window title.">
          <TextInput
            value={c.name}
            placeholder={c.preset === "custom" ? "e.g. English Essay — Draft 2" : "Leave blank to use the preset name"}
            onChange={(v) => patch("cloak", { name: v })}
          />
        </Field>
        <Field label="Favicon" hint="Any URL (we relay it through the lounge) — or we draw a letter badge.">
          <div className="gg-row">
            <div className="gg-seg">
              {[
                { id: "preset", label: "From preset" },
                { id: "url", label: "From URL" },
                { id: "letter", label: "Letter badge" },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={c.iconMode === o.id ? "active" : ""}
                  onClick={() => patch("cloak", { iconMode: o.id as Cloak["iconMode"] })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <input
              type="color"
              aria-label="Letter badge colour"
              value={c.color}
              onChange={(e) => patch("cloak", { color: e.target.value })}
            />
          </div>
          {c.iconMode === "url" ? (
            <TextInput
              mono
              value={c.icon}
              placeholder="https://example.com/favicon.ico"
              onChange={(v) => patch("cloak", { icon: v })}
            />
          ) : null}
        </Field>
        <div className="gg-row wrap">
          <button className="gg-btn" onClick={() => flash("Tab title + favicon updated")}>
            <Check size={14} /> Apply to this tab
          </button>
          <button
            className="gg-btn ghost"
            onClick={() => {
              const w = gg.cloakNow();
              flash(w ? "Opened in a blank tab — the URL bar says about:blank" : "Popup blocked — allow popups for this site");
            }}
          >
            <Ban size={14} /> Open in about:blank window
          </button>
        </div>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">
          <MonitorSmartphone size={15} /> Installed app (PWA)
        </h3>
        <p className="gg-note">
          Installing the lounge as an app gives it a window of its own. With app cloaking on, the install uses your
          cloak name and icon; Chrome re-syncs the name/icon whenever the manifest changes (that happens on every
          cloak edit), or you can reinstall below.
        </p>
        <Field label="Rewrite app name + icon from my cloak" hint="Also updates the shortcut tiles.">
          <Switch on={c.appCloak} onChange={(v) => patch("cloak", { appCloak: v })} />
        </Field>
        <div className="gg-row wrap">
          <button
            className="gg-btn"
            onClick={async () => {
              const r = await gg.install();
              flash(
                r.ok
                  ? "Install prompt opened — pick “Install”"
                  : gg.isStandalone()
                    ? "Already installed: the app name/icon refresh on the next launch"
                    : "No prompt available: use your browser menu → Install/Save page as app",
              );
            }}
          >
            <Download size={14} /> {gg.isStandalone() ? "Re-sync app name & icon" : "Install cloaked app"}
          </button>
          <button className="gg-btn ghost" onClick={() => window.open("/manifest.webmanifest", "_blank")}>
            <Search size={14} /> View manifest
          </button>
        </div>
        <Field label="Auto-cloak on first click" hint="Runs the about:blank cloak the moment you interact with the page.">
          <div className="gg-row wrap">
            <Switch on={c.autoCloak} onChange={(v) => patch("cloak", { autoCloak: v })} />
            <Switch on={c.aboutBlank} onChange={(v) => patch("cloak", { aboutBlank: v })} label="about:blank by default" />
            <small>left: auto-cloak · right: prefer about:blank</small>
          </div>
        </Field>
      </section>
    </>
  );
}

/* --------------------------------------------------------------- panic ----- */

function PanicPanel({
  gg,
  s,
  patch,
  flash,
}: {
  gg: GGApi;
  s: Settings;
  patch: <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => void;
  flash: (m: string) => void;
}) {
  const p = s.panic;
  const [capturing, setCapturing] = useState<null | "main" | "alt">(null);
  const [captured, setCaptured] = useState("");
  const targets = gg.presets.panicTargets;

  useEffect(() => {
    if (!capturing) return;
    // Tell the lounge engine to ignore its own panic handler while we record.
    (window as any).__gg_captureKey = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const label = [
        e.ctrlKey ? "Ctrl" : "",
        e.metaKey ? "Meta" : "",
        e.altKey ? "Alt" : "",
        e.shiftKey ? "Shift" : "",
        e.key === " " ? "Space" : e.key,
      ]
        .filter(Boolean)
        .join(" + ");
      const key = e.key === " " ? "Space" : e.key;
      if (capturing === "main") patch("panic", { key });
      else patch("panic", { alt: key });
      setCaptured(label);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      (window as any).__gg_captureKey = false;
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [capturing, patch]);

  function pickTarget(id: string) {
    const t = targets.find((x) => x.id === id);
    patch("panic", { target: id, url: id === "custom" ? p.url : t?.url || "" });
  }

  const mods = ["None", "Alt", "Ctrl", "Shift"].map((m) => ({ id: m.toLowerCase(), label: m }));

  return (
    <>
      <section className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-icon">
            <Zap size={18} />
          </span>
          <div>
            <h2>Panic key</h2>
            <p>Hit the key, the lounge is gone and a boring school page is there. Re-press to come back from the fake page.</p>
          </div>
          <Switch on={p.enabled} onChange={(v) => patch("panic", { enabled: v })} label="Enable panic key" />
        </div>

        <div className="gg-key-row">
          <button
            type="button"
            className={`gg-keycap${capturing === "main" ? " rec" : ""}`}
            onClick={() => setCapturing(capturing === "main" ? null : "main")}
          >
            <kbd>{prettyKey(p.key)}</kbd>
            <small>{capturing === "main" ? "press any key…" : "main key"}</small>
          </button>
          <button
            type="button"
            className={`gg-keycap alt${capturing === "alt" ? " rec" : ""}`}
            onClick={() => setCapturing(capturing === "alt" ? null : "alt")}
          >
            <kbd>{prettyKey(p.alt)}</kbd>
            <small>{capturing === "alt" ? "press any key…" : "backup key"}</small>
          </button>
          <div className="gg-key-help">
            <Keyboard size={15} />
            <span>
              Two keys, same job: one obvious (<b>~</b> / <b>`</b>), one quiet (<b>Esc</b>). Combos below if you want
              a chord.
            </span>
          </div>
        </div>

        <Field label="Require a modifier too" hint="Off = single key fires instantly (fastest).">
          <div className="gg-row wrap">
            <Switch on={p.requireModifier} onChange={(v) => patch("panic", { requireModifier: v })} />
            <div className="gg-seg">
              {mods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={p.modifier === m.id ? "active" : ""}
                  disabled={!p.requireModifier}
                  onClick={() => patch("panic", { modifier: m.id })}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Panic mode">
          <Choice
            value={p.mode}
            onChange={(v) => patch("panic", { mode: v as Panic["mode"] })}
            options={[
              { id: "replace", label: "Leave the tab", desc: "Navigate away and drop the lounge from history — Back won’t return here." },
              { id: "newtab", label: "Open a decoy tab", desc: "The safe site opens in a new tab; the lounge stays put." },
              { id: "fake", label: "Instant fake page", desc: "No navigation at all: a plain school doc snaps over the lounge." },
            ]}
          />
        </Field>

        {p.mode === "fake" ? (
          <Field label="Fake page heading" hint="Shown at the top of the decoy document.">
            <TextInput value={p.fakeTitle} onChange={(v) => patch("panic", { fakeTitle: v })} />
          </Field>
        ) : null}

        <div className="gg-row wrap">
          <Field label="Back guard" hint="Re-push history so Back can’t reveal the lounge">
            <Switch on={p.backGuard} onChange={(v) => patch("panic", { backGuard: v })} />
          </Field>
          <Field label="Panic when the window loses focus" hint="Uses the fake page so nothing reloads">
            <div className="gg-row">
              <Switch on={p.panicOnBlur} onChange={(v) => patch("panic", { panicOnBlur: v })} />
              <input
                className="gg-input short"
                type="number"
                min={0}
                max={3000}
                step={50}
                value={p.blurDelay}
                onChange={(e) => patch("panic", { blurDelay: Number(e.target.value) })}
                aria-label="Blur delay in ms"
              />
              <small>ms</small>
            </div>
          </Field>
        </div>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">Where the panic key takes you</h3>
        <div className="gg-preset-grid">
          {targets.map((tg) => (
            <button
              key={tg.id}
              type="button"
              className={`gg-preset${p.target === tg.id ? " active" : ""}`}
              onClick={() => pickTarget(tg.id)}
            >
              <span className="gg-preset-icon">
                {tg.icon ? <img src={`/api/img?url=${encodeURIComponent(tg.icon)}`} alt="" loading="lazy" /> : <b>{tg.name.charAt(0)}</b>}
              </span>
              <span className="gg-preset-name">{tg.name}</span>
              {p.target === tg.id ? <Check size={14} className="gg-preset-check" /> : null}
            </button>
          ))}
        </div>
        <Field label="Panic URL" hint="Presets fill this in; edit freely for a custom page.">
          <TextInput mono value={p.url} placeholder="https://classroom.google.com" onChange={(v) => patch("panic", { url: v, target: "custom" })} />
        </Field>
        <div className="gg-row wrap">
          <button className="gg-btn" onClick={() => flash(`Key ${prettyKey(p.key)} → ${p.url || "not set"}`)}>
            <Check size={14} /> Settings saved
          </button>
          <button className="gg-btn danger" onClick={() => gg.panic()}>
            <Zap size={14} /> Test it now ({p.mode})
          </button>
          <button className="gg-btn ghost" onClick={() => gg.showFake()}>
            <EyeOff size={14} /> Preview fake page
          </button>
        </div>
      </section>
    </>
  );
}

function prettyKey(k: string): string {
  if (!k) return "—";
  const map: Record<string, string> = {
    Escape: "Esc",
    "`": "`",
    Delete: "Del",
    Backspace: "⌫",
    Enter: "⏎",
    " ": "Space",
    Control: "Ctrl",
    Meta: "Meta",
    Alt: "Alt",
    Shift: "Shift",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
  };
  return map[k] || (k.length === 1 ? k.toUpperCase() : k);
}

/* --------------------------------------------------------------- themes ---- */

function ThemePanel({
  gg,
  s,
  patch,
  flash,
}: {
  gg: GGApi;
  s: Settings;
  patch: <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => void;
  flash: (m: string) => void;
}) {
  const themes = gg.presets.themes;
  const cur = s.theme;
  return (
    <>
      <section className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-icon">
            <Palette size={18} />
          </span>
          <div>
            <h2>Themes</h2>
            <p>
              Not just a colour swap: each theme changes surfaces, glow, type, and ships its own reactive background.
              Applied to the lounge, the video rooms and the games shell.
            </p>
          </div>
        </div>
        <div className="gg-theme-grid">
          {themes.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`gg-theme${cur.id === th.id ? " active" : ""}`}
              onClick={() => {
                gg.setThemeBackground(th.id);
                flash(`${th.name} applied`);
              }}
              style={{ ["--ta" as string]: th.accent, ["--tb" as string]: th.accent2, ["--tbg" as string]: th.bg }}
            >
              <span className="gg-theme-art">
                <span className="gg-theme-orb" />
                <span className="gg-theme-bar" />
                <span className="gg-theme-card">
                  <i />
                  <i />
                </span>
              </span>
              <span className="gg-theme-meta">
                <b>{th.name}</b>
                <small>
                  {th.tag} · {th.surface} · {th.font}
                </small>
              </span>
              {cur.id === th.id ? <span className="gg-badge">active</span> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">
          <Sliders size={15} /> Tune this theme
        </h3>
        <div className="gg-tune">
          <Field label="Accent override">
            <div className="gg-row">
              <input type="color" value={cur.accent || "#d7f34a"} onChange={(e) => patch("theme", { accent: e.target.value })} aria-label="Accent colour" />
              <TextInput value={cur.accent} placeholder={themes.find((x) => x.id === cur.id)?.accent} onChange={(v) => patch("theme", { accent: v })} />
              <button className="gg-btn ghost" onClick={() => patch("theme", { accent: "" })}>
                reset
              </button>
            </div>
          </Field>
          <Field label="Background colour">
            <div className="gg-row">
              <input type="color" value={cur.bg || "#0b0d12"} onChange={(e) => patch("theme", { bg: e.target.value })} aria-label="Background colour" />
              <TextInput value={cur.bg} placeholder={themes.find((x) => x.id === cur.id)?.bg} onChange={(v) => patch("theme", { bg: v })} />
              <button className="gg-btn ghost" onClick={() => patch("theme", { bg: "" })}>
                reset
              </button>
            </div>
          </Field>
          <Field label="Corner radius">
            <Slider value={cur.radius} min={0} max={28} step={1} label="" format={(v) => `${v}px`} onChange={(v) => patch("theme", { radius: v })} />
          </Field>
          <Field label="Glow" hint="0 = flat, 1.5 = full neon">
            <Slider value={cur.glow < 0 ? 1 : cur.glow} min={0} max={1.6} step={0.05} label="" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch("theme", { glow: v })} />
          </Field>
          <Field label="Overall dim" hint="Darkens the background for readability">
            <Slider value={cur.dim} label="" onChange={(v) => patch("theme", { dim: v })} />
          </Field>
          <Field label="UI scale" hint="Zoom every panel slightly up or down">
            <Slider value={cur.scale} min={0.9} max={1.15} step={0.01} label="" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch("theme", { scale: v })} />
          </Field>
          <Field label="Surface">
            <Choice
              value={cur.surface || "auto"}
              onChange={(v) => patch("theme", { surface: v === "auto" ? "" : v })}
              options={[
                { id: "auto", label: "Theme default" },
                { id: "glass", label: "Glass" },
                { id: "solid", label: "Solid" },
                { id: "neon", label: "Neon" },
                { id: "terminal", label: "Terminal" },
                { id: "paper", label: "Paper" },
                { id: "sharp", label: "Sharp" },
              ]}
            />
          </Field>
          <Field label="Typeface">
            <Choice
              value={cur.font || "auto"}
              onChange={(v) => patch("theme", { font: v === "auto" ? "" : v })}
              options={[
                { id: "auto", label: "Theme default" },
                { id: "default", label: "Grotesk" },
                { id: "mono", label: "Mono" },
                { id: "rounded", label: "Rounded" },
              ]}
            />
          </Field>
        </div>
      </section>
    </>
  );
}

/* ----------------------------------------------------------- backgrounds --- */

function BgPanel({
  gg,
  s,
  patch,
  flash,
}: {
  gg: GGApi;
  s: Settings;
  patch: <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => void;
  flash: (m: string) => void;
}) {
  const b = s.bg;
  const all = gg.presets.backgrounds;
  const [tab, setTab] = useState<"canvas" | "gradient" | "photo" | "video" | "custom">("canvas");
  const fileRef = useRef<HTMLInputElement>(null);
  const canvas = all.filter((x) => x.kind === "canvas");
  const grads = all.filter((x) => x.kind === "gradient");
  const photos = all.filter((x) => x.kind === "image");
  const vids = all.filter((x) => x.kind === "video");
  const list = tab === "canvas" ? canvas : tab === "gradient" ? grads : tab === "photo" ? photos : tab === "video" ? vids : [];

  const tiles: Record<string, string> = {
    aurora: "radial-gradient(circle at 30% 30%,#6ee7ff55,transparent 60%),radial-gradient(circle at 70% 60%,#a78bfa55,transparent 60%),#070b16",
    starfield: "radial-gradient(#fff8 1px,transparent 1px) 0 0/22px 22px,#05030f",
    matrix: "repeating-linear-gradient(90deg,#39ff1433 0 3px,transparent 3px 9px),#010603",
    synthgrid: "linear-gradient(#ff6ad544,transparent 40%),repeating-linear-gradient(0deg,#7873f555 0 1px,transparent 1px 14px),#150026",
    grid: "repeating-linear-gradient(90deg,#00f0ff2e 0 1px,transparent 1px 26px),repeating-linear-gradient(0deg,#00f0ff2e 0 1px,transparent 1px 26px),#05010c",
    bubbles: "radial-gradient(circle at 40% 70%,#4fd1c533,transparent 50%),#02121c",
    snow: "radial-gradient(#ffffffaa 1.5px,transparent 1.6px) 0 0/28px 34px,#050f18",
    embers: "radial-gradient(circle at 50% 95%,#ff4d4d55,transparent 55%),#0d0205",
    fireflies: "radial-gradient(circle at 20% 40%,#d9f99d44 0 3px,transparent 4px),#04100a",
    petals: "radial-gradient(circle at 60% 20%,#fb7fb244 0 6px,transparent 7px),#1a0d16",
    plasma: "conic-gradient(from 40deg,#b6ff0055,#00ffa344,#b6ff0055),#060a03",
    constellation: "linear-gradient(#c4b5fd33,transparent),#05030f",
    magnet: "radial-gradient(#e879f966 1px,transparent 1px) 0 0/18px 18px,#0a0413",
    trails: "linear-gradient(120deg,#22d3ee44,#e879f944),#060614",
    ripple: "repeating-radial-gradient(circle at 50% 50%,#9adcff22 0 8px,transparent 8px 22px),#050f18",
    confetti: "conic-gradient(from 0deg,#ff4d4d66,#ffd54a66,#39ff1466,#00f0ff66,#ff4d4d66),#0d0205",
    speed: "repeating-linear-gradient(100deg,#ff8a5b33 0 2px,transparent 2px 22px),#180711",
    shimmer: "linear-gradient(115deg,#ffd54a55,transparent 40%),#0b0803",
    rain: "repeating-linear-gradient(94deg,#9adcff2e 0 1px,transparent 1px 12px),#050f18",
    noise: "radial-gradient(#ffffff22 1px,transparent 1px) 0 0/6px 6px,#0b0f14",
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("image/")) {
      flash("Pick a photo or a video file");
      return;
    }
    if (file.size > (isVideo ? 40 : 8) * 1024 * 1024) {
      flash(`${isVideo ? "Video" : "Image"} is too big (${(file.size / 1048576).toFixed(1)}MB)`);
      return;
    }
    try {
      const key = await ggStoreFile(file);
      patch("bg", { customUrl: `idb:${key}`, customKind: isVideo ? "video" : "image" });
      flash(`Your ${isVideo ? "clip" : "photo"} is now the background`);
    } catch {
      flash("Couldn’t save that file locally");
    }
  }

  return (
    <>
      <section className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h2>Backgrounds</h2>
            <p>
              Everything below is live right now — the picker sits on top of your chosen background. Cursor and
              keyboard reactivity stack on any of them.
            </p>
          </div>
        </div>

        <div className="gg-seg wide">
          {(
            [
              { id: "canvas", label: "Live / reactive" },
              { id: "gradient", label: "Meshes" },
              { id: "photo", label: "Photos" },
              { id: "video", label: "Videos" },
              { id: "custom", label: "Your own" },
            ] as const
          ).map((o) => (
            <button key={o.id} type="button" className={tab === o.id ? "active" : ""} onClick={() => setTab(o.id)}>
              {o.label}
            </button>
          ))}
        </div>

        {tab === "custom" ? (
          <div className="gg-upload">
            <div className="gg-upload-drop">
              <FileVideo size={22} />
              <p>Drop a photo (≤8MB) or a looping clip (≤40MB). Stored in this browser only — never uploaded.</p>
              <div className="gg-row wrap">
                <button className="gg-btn" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> Choose file
                </button>
                <button
                  className="gg-btn ghost"
                  onClick={() => patch("bg", { customUrl: "", customKind: "" })}
                >
                  <RotateCcw size={14} /> Clear
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
            <Field label="…or from a URL" hint="Relayed through the lounge, so filters can’t see it.">
              <TextInput
                mono
                value={/^https?:/.test(b.customUrl) ? b.customUrl : ""}
                placeholder="https://site.com/loop.mp4"
                onChange={(v) => patch("bg", { customUrl: v, customKind: /\.(mp4|webm|ogg|mov)(\?|$)/i.test(v) ? "video" : "image" })}
              />
            </Field>
            <Field label="Type">
              <Choice
                value={b.customKind || "image"}
                onChange={(v) => patch("bg", { customKind: v })}
                options={[
                  { id: "image", label: "Photo" },
                  { id: "video", label: "Video loop" },
                ]}
              />
            </Field>
          </div>
        ) : (
          <div className="gg-bg-grid">
            {tab === "gradient" ? (
              <button
                type="button"
                className={`gg-bg-card${b.id === "none" ? " active" : ""}`}
                onClick={() => patch("bg", { id: "none" })}
              >
                <span className="gg-bg-thumb" style={{ background: "repeating-conic-gradient(#101018 0 25%, #181824 0 50%) 0 0/18px 18px" }} />
                <b>Plain colour</b>
                <small>Theme background only</small>
              </button>
            ) : null}
            {list.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`gg-bg-card${b.id === item.id ? " active" : ""}`}
                onClick={() => {
                  patch("bg", { id: item.id });
                  gg.reseedBackground();
                }}
                title={item.desc || item.name}
              >
                <span
                  className="gg-bg-thumb"
                  style={
                    item.kind === "canvas"
                      ? { background: tiles[item.id] || "#111" }
                      : item.kind === "gradient"
                        ? { background: item.grad }
                        : { backgroundImage: `url(${item.kind === "image" ? `/api/img?url=${encodeURIComponent(item.url || "")}` : `/api/img?url=${encodeURIComponent(item.poster || item.url || "")}`})`, backgroundSize: "cover" }
                  }
                >
                  {item.kind === "video" ? <span className="gg-bg-play"><FileVideo size={13} /></span> : null}
                  {item.tag === "cursor+keys" || item.tag === "keys" ? <span className="gg-bg-flag"><Keyboard size={11} /></span> : null}
                  {item.tag === "cursor" ? <span className="gg-bg-flag"><MousePointerClick size={11} /></span> : null}
                </span>
                <b>{item.name}</b>
                <small>{item.desc || item.kind}</small>
              </button>
            ))}
            {tab === "photo"
              ? STOCK_SEEDS.map((seed) => (
                  <button
                    key={seed.id}
                    type="button"
                    className={`gg-bg-card${b.customKind === "image" && b.customUrl.includes(seed.seed) ? " active" : ""}`}
                    onClick={() => patch("bg", { customKind: "image", customUrl: `https://picsum.photos/seed/${seed.seed}/1920/1080.jpg` })}
                  >
                    <span className="gg-bg-thumb" style={{ backgroundImage: `url(/api/img?url=${encodeURIComponent(`https://picsum.photos/seed/${seed.seed}/360/202.jpg`)})`, backgroundSize: "cover" }} />
                    <b>{seed.name}</b>
                    <small>random {seed.extra}</small>
                  </button>
                ))
              : null}
          </div>
        )}
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">
          <MousePointerClick size={15} /> Cursor & keyboard
        </h3>
        <div className="gg-tune">
          <Field label="Cursor behaviour" hint="Auto follows what the background is built for.">
            <Choice
              value={b.cursor}
              onChange={(v) => patch("bg", { cursor: v })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "none", label: "None" },
                { id: "spotlight", label: "Spotlight" },
                { id: "trail", label: "Comet trail" },
                { id: "magnet", label: "Magnet" },
              ]}
            />
          </Field>
          <Field label="Keyboard behaviour" hint="Every keystroke pushes energy into the layer.">
            <Choice
              value={b.keyboard}
              onChange={(v) => patch("bg", { keyboard: v })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "none", label: "None" },
                { id: "pulse", label: "Pulse ripples" },
                { id: "ripple", label: "Soft ripples" },
                { id: "rain", label: "Glyph burst" },
                { id: "confetti", label: "Confetti" },
              ]}
            />
          </Field>
          <Field label="Density" hint="How many particles are in play">
            <Slider value={b.intensity} label="" onChange={(v) => { patch("bg", { intensity: v }); gg.reseedBackground(); }} />
          </Field>
          <Field label="Speed">
            <Slider value={b.speed} label="" onChange={(v) => patch("bg", { speed: v })} />
          </Field>
          <Field label="Background opacity">
            <Slider value={b.opacity} min={0.1} max={1} label="" onChange={(v) => patch("bg", { opacity: v })} />
          </Field>
          <Field label="Dim scrim" hint="Keeps text readable over bright media">
            <Slider value={b.dim} label="" onChange={(v) => patch("bg", { dim: v })} />
          </Field>
          <Field label="Blur">
            <Slider value={b.blur} min={0} max={16} step={0.5} label="" format={(v) => `${v}px`} onChange={(v) => patch("bg", { blur: v })} />
          </Field>
          <Field label="Video loops" hint="Also: mute the clip, or let it play with sound">
            <div className="gg-row wrap">
              <Switch on={b.loop} onChange={(v) => patch("bg", { loop: v })} label="Loop" />
              <span className="gg-inline-label">loop</span>
              <Switch on={b.muted} onChange={(v) => patch("bg", { muted: v })} label="Mute" />
              <span className="gg-inline-label">muted</span>
            </div>
          </Field>
          <Field label="Pause motion" hint="Static frame — best for slow machines / smartboards">
            <Switch
              on={s.ui.reduceMotion}
              onChange={(v) => patch("ui", { reduceMotion: v })}
              label="Reduce motion"
            />
          </Field>
        </div>
      </section>
    </>
  );
}

const STOCK_SEEDS = [
  { id: "aur", seed: "aurora", name: "Northern Lights", extra: "photo" },
  { id: "neb", seed: "nebula", name: "Nebula", extra: "photo" },
  { id: "tok", seed: "tokyo", name: "Tokyo Rain", extra: "photo" },
  { id: "for", seed: "forest", name: "Deep Forest", extra: "photo" },
  { id: "oce", seed: "ocean", name: "Open Ocean", extra: "photo" },
  { id: "cit", seed: "city", name: "City Light", extra: "photo" },
];

/* ---------------------------------------------------------- video engine --- */

function VideoPanel({
  s,
  patch,
  flash,
}: {
  s: Settings;
  patch: <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => void;
  flash: (m: string) => void;
}) {
  const v = s.video;
  const [health, setHealth] = useState<any>(null);
  const [testing, setTesting] = useState("");
  const [deep, setDeep] = useState(false);

  async function runTest(deepRun: boolean) {
    setTesting(deepRun ? "deep" : "fast");
    try {
      const r = await fetch(`/api/yt/health?${deepRun ? "deep=1" : ""}`, { cache: "no-store" });
      setHealth(await r.json());
      flash("Engine test finished");
    } catch {
      setHealth({ error: "health check failed" });
      flash("Health check failed — the lounge server itself is unhappy");
    } finally {
      setTesting("");
    }
  }

  return (
    <>
      <section className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-icon">
            <Activity size={18} />
          </span>
          <div>
            <h2>Video engine</h2>
            <p>
              YouTube and TikTok both run through this. The lounge server does the fetching; your browser only ever
              talks to the lounge domain — that is what gets past a school filter.
            </p>
          </div>
        </div>

        <Field label="Server priority" hint="Auto tries YouTube first, then community mirrors.">
          <Choice
            value={v.provider}
            onChange={(x) => patch("video", { provider: x })}
            options={[
              { id: "auto", label: "Auto", desc: "YouTube → Piped → Invidious" },
              { id: "innertube", label: "YouTube direct", desc: "Server talks to youtube.com" },
              { id: "piped", label: "Piped mirrors", desc: "Community Piped API" },
              { id: "invidious", label: "Invidious mirrors", desc: "Community Invidious API" },
            ]}
          />
        </Field>

        <Field label="School mode" hint="Route video bytes through this site. Turn off only if playback buffers.">
          <div className="gg-row wrap">
            <Switch on={v.schoolMode} onChange={(x) => patch("video", { schoolMode: x })} label="School mode" />
            <span className="gg-inline-label">proxy video traffic</span>
            <Switch on={v.strictImg} onChange={(x) => patch("video", { strictImg: x })} label="Proxy images" />
            <span className="gg-inline-label">proxy thumbnails</span>
          </div>
        </Field>

        <div className="gg-row wrap">
          <Field label="Max quality">
            <Choice
              value={v.quality}
              onChange={(x) => patch("video", { quality: x })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "1080", label: "1080p" },
                { id: "720", label: "720p" },
                { id: "480", label: "480p" },
                { id: "360", label: "360p" },
              ]}
            />
          </Field>
          <Field label="Player">
            <Choice
              value={v.engine}
              onChange={(x) => patch("video", { engine: x })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "hls", label: "HLS (HD)", desc: "Needs hls.js" },
                { id: "mp4", label: "MP4 (compatible)", desc: "Most reliable" },
              ]}
            />
          </Field>
        </div>

        <div className="gg-row wrap">
          <Field label="Trending region">
            <select
              className="gg-select"
              value={v.region}
              onChange={(e) => patch("video", { region: e.target.value })}
            >
              {["US", "GB", "AU", "CA", "NZ", "IN", "DE", "FR", "JP", "BR", "KR", "MX"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Autoplay next" hint="Rolls into the recommended video">
            <Switch on={v.autoplay} onChange={(x) => patch("video", { autoplay: x })} />
          </Field>
          <Field label="Skip sponsors" hint="SponsorBlock segments">
            <Switch on={v.skipSponsors} onChange={(x) => patch("video", { skipSponsors: x })} />
          </Field>
          <Field label="Captions by default">
            <Switch on={v.captions} onChange={(x) => patch("video", { captions: x })} />
          </Field>
        </div>

        <Field label="Custom mirror URL" hint="Optional. Overrides the pool above entirely.">
          <TextInput
            mono
            value={v.instance}
            placeholder="https://pipedapi.my-mirror.dev"
            onChange={(x) => patch("video", { instance: x })}
          />
        </Field>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">
          <Gauge size={15} /> Reachability
        </h3>
        <p className="gg-note">
          Runs from the lounge server. If a provider is red, the video rooms automatically skip it.
        </p>
        <div className="gg-row wrap">
          <button className="gg-btn" onClick={() => runTest(false)} disabled={!!testing}>
            <Activity size={14} /> {testing === "fast" ? "Testing…" : "Test now"}
          </button>
          <button className="gg-btn ghost" onClick={() => runTest(true)} disabled={!!testing}>
            <Wind size={14} /> {testing === "deep" ? "Testing streams…" : "Deep test (streams)"}
          </button>
          <label className="gg-check">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            show raw detail
          </label>
        </div>
        {health ? (
          <div className="gg-health">
            {Object.entries(health.providers || {}).map(([name, p]: [string, any]) => (
              <div key={name} className={`gg-health-row ${p?.ok ? "ok" : "bad"}`}>
                <span className="gg-health-dot" />
                <b>{name}</b>
                <span className="gg-health-ms">{p?.ms ?? 0}ms</span>
                <span className="gg-health-detail">{deep ? p?.detail : String(p?.detail || "").slice(0, 60)}</span>
              </div>
            ))}
            <div className="gg-health-summary">
              {health.usable ? "Video rooms are ready." : "No provider answered — try “Piped mirrors” or “Invidious mirrors”, or turn School mode off."}
            </div>
          </div>
        ) : (
          <p className="gg-note">No test run yet.</p>
        )}
      </section>
    </>
  );
}

/* ----------------------------------------------------------------- data ---- */

function DataPanel({
  gg,
  s,
  patch,
  flash,
}: {
  gg: GGApi;
  s: Settings;
  patch: <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => void;
  flash: (m: string) => void;
}) {
  const [profileName, setProfileName] = useState("My Lounge");
  const [list, setList] = useState<{ name: string; at: number }[]>([]);

  useEffect(() => {
    try {
      setList(JSON.parse(localStorage.getItem("gg.profiles") || "[]"));
    } catch {
      setList([]);
    }
  }, []);

  function saveProfile() {
    const name = (profileName || "My Lounge").slice(0, 32);
    const entries = (() => {
      try {
        return JSON.parse(localStorage.getItem("gg.profiles") || "[]");
      } catch {
        return [];
      }
    })();
    const next = [{ name, at: Date.now() }, ...entries.filter((e: any) => e.name !== name)].slice(0, 12);
    localStorage.setItem("gg.profiles", JSON.stringify(next));
    localStorage.setItem("gg.profile." + name, JSON.stringify(s));
    setList(next);
    flash(`Profile “${name}” saved`);
  }

  function loadProfile(name: string) {
    const raw = localStorage.getItem("gg.profile." + name);
    if (!raw) return flash("That profile is empty");
    gg.import(raw);
    flash(`Profile “${name}” applied`);
  }

  return (
    <>
      <section className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-icon">
            <Save size={18} />
          </span>
          <div>
            <h2>Profiles & data</h2>
            <p>
              Everything lives in this browser (localStorage + IndexedDB). No account, no server copy, cleared by
              “Clear browsing data”.
            </p>
          </div>
        </div>
        <Field label="Profile name">
          <div className="gg-row wrap">
            <TextInput value={profileName} onChange={setProfileName} placeholder="My Lounge" />
            <button className="gg-btn" onClick={saveProfile}>
              <Save size={14} /> Save profile
            </button>
          </div>
        </Field>
        {list.length ? (
          <div className="gg-profiles">
            {list.map((p) => (
              <button key={p.name} className="gg-btn ghost" onClick={() => loadProfile(p.name)}>
                {p.name} <small>{new Date(p.at).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        ) : null}
        <Field label="Export / import">
          <div className="gg-row wrap">
            <button
              className="gg-btn ghost"
              onClick={() => {
                navigator.clipboard?.writeText(gg.export()).then(
                  () => flash("Settings JSON copied to the clipboard"),
                  () => flash(gg.export().slice(0, 40)),
                );
              }}
            >
              <Download size={14} /> Copy JSON
            </button>
            <button
              className="gg-btn ghost"
              onClick={() => {
                const raw = window.prompt("Paste a settings JSON");
                if (!raw) return;
                try {
                  gg.import(raw);
                  flash("Imported");
                } catch {
                  flash("That JSON didn’t parse");
                }
              }}
            >
              <Upload size={14} /> Paste JSON
            </button>
            <button
              className="gg-btn danger"
              onClick={() => {
                if (!window.confirm("Reset all lounge settings (cloak, panic, theme, background, video)?")) return;
                gg.reset();
                flash("Back to defaults");
              }}
            >
              <RotateCcw size={14} /> Reset everything
            </button>
          </div>
        </Field>
      </section>

      <section className="gg-card">
        <h3 className="gg-sub-head">Lounge tweaks</h3>
        <Field label="Compact library cards" hint="More games above the fold">
          <Switch on={s.ui.compactCards} onChange={(x) => patch("ui", { compactCards: x })} />
        </Field>
        <Field label="Floating settings button" hint="Show the gear FAB on the home page">
          <Switch on={s.ui.showSettingsFab} onChange={(x) => patch("ui", { showSettingsFab: x })} />
        </Field>
        <Field label="Hide header links" hint="Removes the Studio / Request / Admin links from the top bar">
          <Switch on={s.ui.hideHeaderLinks} onChange={(x) => patch("ui", { hideHeaderLinks: x })} />
        </Field>
        <Field label="Reduce motion" hint="Turns animated backgrounds into a still frame">
          <Switch on={s.ui.reduceMotion} onChange={(x) => patch("ui", { reduceMotion: x })} />
        </Field>
      </section>

      <section className="gg-card gg-card-shortcuts">
        <h3 className="gg-sub-head">
          <ImageIcon size={15} /> Quick actions
        </h3>
        <div className="gg-row wrap">
          <a className="gg-btn" href="/games/youtube/index.html">
            Open YouTube room
          </a>
          <a className="gg-btn" href="/games/tiktok/index.html">
            Open TikTok room
          </a>
          <a className="gg-btn ghost" href="/proxy">
            Unblocked browser
          </a>
          <a className="gg-btn ghost" href="/">
            Back to the arcade
          </a>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------- local file storage --- */

/** Small IndexedDB wrapper so big custom backgrounds don't hit the 5MB
 *  localStorage quota. Returns the key we stored it under. */
function ggStoreFile(file: File): Promise<string> {
  const key = "bg-" + Date.now().toString(36);
  return new Promise((resolve, reject) => {
    try {
      const open = indexedDB.open("gg-files", 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put(file, key);
        tx.oncomplete = () => {
          resolve(key);
          db.close();
        };
        tx.onerror = () => {
          reject(tx.error);
          db.close();
        };
      };
      open.onerror = () => reject(open.error);
    } catch (err) {
      reject(err);
    }
  });
}
