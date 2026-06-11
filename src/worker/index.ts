// Cloudflare Worker — password-gated PAT handoff for Decap CMS.
//
// SECURITY MODEL:
//
// 1. The only credential is CMS_PASSWORD (a Cloudflare encrypted secret).
//    Compared against the submitted form value using a constant-time check
//    to defeat timing oracles. Failed attempts incur a fixed 1s delay to
//    make brute-force impractical.
// 2. On success the Worker hands the stored GitHub Personal Access Token
//    (GITHUB_PAT, also a Cloudflare encrypted secret) to the browser via
//    window.postMessage in the format Decap CMS expects. The PAT never
//    appears in logs, response headers, or anywhere outside this script.
// 3. The PAT is a Fine-grained Personal Access Token scoped to a SINGLE
//    repository (whal-e3/myblog) with only Contents Read+Write. Even if it
//    leaked, the blast radius is one blog repo and nothing else.
// 4. The login form carries a CSRF nonce in an httpOnly+secure+SameSite=Lax
//    cookie, verified constant-time against a hidden form field. Defense
//    in depth — primary protection is the password itself.
// 5. OAuth handling is refused on any origin other than SITE_ORIGIN, so
//    workers.dev URLs and preview deploys can't be used to bypass.
// 6. Strict CSP, HSTS, frame-ancestors none, Cache-Control no-store.
//
// Everything else falls through to static assets (Astro build output).

interface Env {
  ASSETS: Fetcher;
  GITHUB_PAT: string;
  CMS_PASSWORD: string;
  GITHUB_REPO: string;
  SITE_ORIGIN: string;
}

const CSRF_COOKIE = "decap_csrf";
const CSRF_TTL_SECONDS = 600;
const FAILED_LOGIN_DELAY_MS = 1000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Refuse OAuth on non-prod origins (workers.dev, preview deploys).
    if (url.origin !== env.SITE_ORIGIN) {
      if (url.pathname.startsWith("/oauth/")) {
        return new Response("OAuth disabled on this origin.", {
          status: 403,
          headers: securityHeaders(),
        });
      }
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/oauth/auth") {
      if (request.method === "GET") return showLoginForm(env);
      if (request.method === "POST") return handleLogin(request, env);
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...securityHeaders(), Allow: "GET, POST" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

// ─── GET /oauth/auth ───────────────────────────────────────────────────────
// Render the password form with a fresh CSRF nonce.

function showLoginForm(_env: Env, errorMsg?: string): Response {
  const csrf = generateNonce();
  const headers = new Headers({
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; " +
      "base-uri 'none'; frame-ancestors 'none'",
  });
  headers.append(
    "Set-Cookie",
    `${CSRF_COOKIE}=${csrf}; Path=/oauth; Max-Age=${CSRF_TTL_SECONDS}; ` +
      `HttpOnly; Secure; SameSite=Lax`,
  );

  const errorHtml = errorMsg
    ? `<p class="error">${escapeHtml(errorMsg)}</p>`
    : "";

  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sign in — sunhyuk.dev CMS</title>
<style>
:root{color-scheme:dark}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0510;color:#f5e6d4;
  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
form{background:rgba(20,10,30,0.7);border:1px solid rgba(245,230,212,0.12);
  border-radius:14px;padding:40px 36px;max-width:380px;width:100%;
  box-shadow:0 10px 40px rgba(0,0,0,0.5)}
h1{font-size:1.3rem;font-weight:600;margin:0 0 6px;letter-spacing:-0.01em}
.sub{color:#a89684;font-size:0.85rem;margin:0 0 28px;font-family:ui-monospace,monospace}
label{display:block;font-family:ui-monospace,monospace;font-size:0.72rem;font-weight:600;
  text-transform:uppercase;letter-spacing:0.12em;color:#ff6b2a;margin-bottom:8px}
input[type=password]{width:100%;box-sizing:border-box;padding:12px 14px;
  background:rgba(245,230,212,0.04);border:1px solid rgba(245,230,212,0.18);
  border-radius:8px;color:#f5e6d4;font-size:0.95rem;font-family:inherit;
  transition:border-color 0.15s}
input[type=password]:focus{outline:none;border-color:#ff6b2a}
button{width:100%;margin-top:18px;padding:12px;background:#ff6b2a;color:#0a0510;
  border:none;border-radius:8px;font-weight:600;font-size:0.95rem;cursor:pointer;
  transition:background 0.15s}
button:hover{background:#ff7e44}
.error{color:#ff6b6b;font-size:0.85rem;margin:0 0 14px;padding:10px 14px;
  background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.3);
  border-radius:8px}
</style>
</head><body>
<form method="POST" action="/oauth/auth" autocomplete="off">
  <h1>sunhyuk.dev CMS</h1>
  <p class="sub">Restricted access</p>
  ${errorHtml}
  <label for="p">Password</label>
  <input type="password" name="password" id="p" autofocus required>
  <input type="hidden" name="csrf" value="${csrf}">
  <button type="submit">Sign in</button>
</form>
</body></html>`;

  return new Response(body, { status: 200, headers });
}

// ─── POST /oauth/auth ──────────────────────────────────────────────────────
// Verify CSRF + password (constant-time), then deliver PAT via postMessage.

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let password: string;
  let csrf: string;
  try {
    const form = await request.formData();
    password = (form.get("password") as string) || "";
    csrf = (form.get("csrf") as string) || "";
  } catch {
    return showLoginForm(env, "Malformed form submission.");
  }

  const cookieCsrf = readCookie(request, CSRF_COOKIE);
  if (!cookieCsrf || !constantTimeEqual(cookieCsrf, csrf)) {
    return showLoginForm(env, "Session expired. Try again.");
  }

  if (!constantTimeEqual(password, env.CMS_PASSWORD)) {
    // Fixed delay so timing reveals nothing AND throttles brute force.
    await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
    return showLoginForm(env, "Wrong password.");
  }

  return tokenResponsePage(env.GITHUB_PAT);
}

// ─── Token handoff page ────────────────────────────────────────────────────
// Sends the PAT to window.opener (the Decap CMS popup parent) using the
// exact message format Decap CMS waits for.

function tokenResponsePage(token: string): Response {
  const payload = JSON.stringify({ token, provider: "github" });
  const safe = payload.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const script = `
(function(){
  var message = 'authorization:github:success:' + ${JSON.stringify(safe)};
  function send(){
    if (!window.opener) return;
    window.opener.postMessage(message, '*');
  }
  window.addEventListener('message', function(e){
    if (e.data === 'authorizing:github') send();
  }, false);
  send();
})();
`.trim();

  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers({
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": csp,
  });
  // Burn the CSRF cookie — single use.
  headers.append(
    "Set-Cookie",
    `${CSRF_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );

  const body =
    `<!doctype html><meta charset="utf-8"><title>Authorized</title>` +
    `<style>body{font-family:system-ui,sans-serif;background:#0a0510;color:#f5e6d4;` +
    `padding:48px;text-align:center}</style>` +
    `<p>Authorized. You can close this window.</p>` +
    `<script>${script}</script>`;
  return new Response(body, { status: 200, headers });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "interest-cohort=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
