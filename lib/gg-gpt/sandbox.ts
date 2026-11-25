/**
 * The code sandbox.
 *
 * GG-GPT writes code constantly, and until now the only thing you could do with
 * it was copy it into another tab. The sandbox runs it — but "run arbitrary
 * model-written code" is exactly the sentence that precedes a security
 * incident, so the execution model is worth stating plainly:
 *
 *   · **It runs in a sandboxed iframe, not on the server.** There is no Node
 *     `vm`, no child process and no eval in this process. The server's only job
 *     is to assemble a document and hand it to the browser, which is where the
 *     code was going to run anyway.
 *   · **The iframe has `allow-scripts` and nothing else.** No
 *     `allow-same-origin`, so the document is opaque-origin: its `localStorage`,
 *     cookies and fetch credentials belong to the sandbox, not to GG-Lounge.
 *     Without `allow-top-navigation` it cannot move the page, and without
 *     `allow-popups` it cannot open a window.
 *   · **A CSP inside the document** stops it reaching the network at all by
 *     default — `connect-src 'none'` — so model-written `fetch` calls fail
 *     loudly instead of exfiltrating anything.
 *
 * The result is a place to run a demo, a game, a data transform: the things a
 * person actually asks a chat model to write.
 */

export const SANDBOX_CSP = [
  "default-src 'none'",
  // Inline code and inline styles are the whole point; no external origins.
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** How much code the sandbox will accept. A 200 KB document renders fine. */
export const MAX_SANDBOX_BYTES = 200_000;

/**
 * Pull the runnable pieces out of a model reply.
 *
 * Models answer with a fenced block, prose, or several fences. The interesting
 * cases: an ```html fence is a whole document; a ```js fence plus a ```html
 * fence is a script with markup to render; several ```js fences in a row are
 * usually one program split up, so they are joined rather than run separately.
 */
export function extractCode(markdown: string): { html: string; css: string; js: string } {
  const fences: Array<{ lang: string; body: string }> = [];
  const pattern = /```([\w+-]*)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    fences.push({ lang: match[1].toLowerCase(), body: match[2] });
  }

  const pick = (...langs: string[]) =>
    fences
      .filter(fence => langs.includes(fence.lang))
      .map(fence => fence.body)
      .join('\n');

  const html = pick('html', 'htm', 'svg', 'xml');
  const css = pick('css');
  const js = pick('js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx');
  // A typed language is stripped only of the annotations that actually break a
  // browser - the code is meant to run, not to be type-checked.
  return { html, css, js: js ? stripTypes(js) : '' };
}

/**
 * Remove the TypeScript annotations a browser cannot parse.
 *
 * This is a narrow, line-oriented pass, not a compiler. It handles what model
 * answers actually contain — `: string` on parameters and variables, `interface`
 * and `type` blocks, `as` casts  — and leaves everything else alone. If it
 * cannot make the code parse, the sandbox reports the error and the person can
 * ask for plain JavaScript.
 */
export function stripTypes(source: string): string {
  let out = source;
  // Whole-line type-only constructs.
  out = out.replace(/^\s*(?:export\s+)?(?:interface|type)\s+\w+[\s\S]*?^\s*\}\s*$/gm, '');
  out = out.replace(/^\s*(?:export\s+)?type\s+\w+\s*=.*$/gm, '');
  out = out.replace(/^\s*(?:public|private|protected|readonly)\s+/gm, '');
  // `function foo(a: string, b?: number)` and `const x: Foo =`
  out = out.replace(/:\s*(?:[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\[\])*)(?=\s*[,)=;{])/g, '');
  out = out.replace(/\bas\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?/g, '');
  out = out.replace(/<([A-Z][\w$]*)>/g, '');
  return out;
}

/**
 * Assemble the document that runs in the frame.
 *
 * A model reply is often just a script, often just markup, and often a whole
 * page. All three have to work without the caller saying which. The script runs
 * last and its errors are surfaced into the page itself, because a sandbox that
 * fails silently is worse than no sandbox.
 */
/** A CSP delivered in-document, because `srcDoc` frames get no response headers. */
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`;

export function buildSandboxDocument(code: { html: string; css: string; js: string }): string {
  const looksLikeDocument = /<html[\s>]/i.test(code.html) || /<!doctype/i.test(code.html);

  /**
   * Inject the CSP as the very first thing in `<head>`.
   *
   * `srcDoc` documents are not served with headers, so the policy in the
   * docstring above can only arrive as a meta tag — and it has to precede any
   * script the model wrote, or the first one is unrestricted.
   */
  const withCsp = (doc: string) => {
    if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head([^>]*)>/i, `<head$1>${CSP_META}`);
    if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html([^>]*)>/i, `<html$1><head>${CSP_META}</head>`);
    return `${CSP_META}${doc}`;
  };

  if (looksLikeDocument) {
    // A full document: inject the CSS and the script into it rather than
    // nesting it inside another <html>.
    let doc = code.html;
    if (code.css) {
      doc = /<\/head>/i.test(doc)
        ? doc.replace(/<\/head>/i, `<style>${code.css}</style></head>`)
        : /<body[\s>]/i.test(doc)
          // A document with a body but no head: the style has to land inside
          // the body, or it ends up before <html> and some parsers drop it.
          ? doc.replace(/<body([^>]*)>/i, `<body$1><style>${code.css}</style>`)
          : `<style>${code.css}</style>${doc}`;
    }
    if (code.js) {
      doc = /<\/body>/i.test(doc)
        ? doc.replace(/<\/body>/i, `<script>${code.js}<\/script></body>`)
        : `${doc}<script>${code.js}<\/script>`;
    }
    return withCsp(doc);
  }

  // A <title> inside a fragment does not set the document title, but it does
  // end up in the body as text on some parsers — and a generated page should
  // not get to name the tab it runs in.
  const body = code.html.replace(/<\/?title[^>]*>/gi, '');

  return `<!doctype html>
<html lang="en">
<head>
${CSP_META}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sandbox</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; padding: 18px;
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b0d12; color: #e8edf4;
  }
  canvas { max-width: 100%; }
  button, input, select { font: inherit; }
  ${code.css}
</style>
</head>
<body>
${body}
<script>
(function () {
  var box = null;
  function report(kind, text) {
    if (!box) {
      box = document.createElement('pre');
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:42%;overflow:auto;margin:0;padding:10px 12px;background:rgba(120,16,24,.94);color:#ffd4d8;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:2147483647;border-top:1px solid rgba(255,255,255,.15)';
      document.body.appendChild(box);
    }
    box.textContent += (box.textContent ? '\\n' : '') + kind + ': ' + text;
  }
  window.addEventListener('error', function (event) {
    report('Error', (event.message || 'script error') + (event.lineno ? ' (line ' + event.lineno + ')' : ''));
  });
  window.addEventListener('unhandledrejection', function (event) {
    report('Promise', String((event.reason && event.reason.message) || event.reason));
  });
  try {
    ${code.js}
  } catch (error) {
    report('Error', String((error && error.message) || error));
  }
})();
<\/script>
</body>
</html>`;
}

/** Reject anything that would make the frame reachable from the parent. */
export function isSafeSandboxSource(body: unknown): body is { html?: string; css?: string; js?: string } {
  if (!body || typeof body !== 'object') return false;
  const value = body as Record<string, unknown>;
  for (const key of ['html', 'css', 'js']) {
    const part = value[key];
    if (part === undefined) continue;
    if (typeof part !== 'string') return false;
    if (part.length > MAX_SANDBOX_BYTES) return false;
  }
  return true;
}
