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
//    a fetch() response. The popup page then window.postMessage's the
//    token to its opener (the Decap CMS /admin tab). The PAT never appears
//    in logs, response headers, or anywhere outside this script.
// 3. The PAT is a Fine-grained Personal Access Token scoped to a SINGLE
//    repository (whal-e3/myblog) with only Contents Read+Write. Even if it
//    leaked, the blast radius is one blog repo and nothing else.
// 4. The login form carries a CSRF nonce in an httpOnly+secure+SameSite=Lax
//    cookie, verified constant-time against a hidden form field. Defense
//    in depth — primary protection is the password itself.
// 5. The popup submits via fetch() rather than a browser form POST so that
//    no document navigation occurs. Browser-stripping of window.opener
//    after POST navigation was breaking the token handoff, so we keep the
//    popup at /oauth/auth the whole time.
// 6. OAuth handling is refused on any origin other than SITE_ORIGIN, so
//    workers.dev URLs and preview deploys can't be used to bypass.
// 7. Strict CSP, HSTS, frame-ancestors none, Cache-Control no-store.
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
      return serveAssets(request, env);
    }

    if (url.pathname === "/oauth/auth") {
      if (request.method === "GET") return showLoginForm();
      if (request.method === "POST") return handleLogin(request, env);
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...securityHeaders(), Allow: "GET, POST" },
      });
    }

    return serveAssets(request, env);
  },
};

// ─── Static assets + country-based default language ─────────────────────────
// The site language defaults to the visitor's country (Korea → Korean,
// elsewhere → English) by stamping `data-default-lang` on <html> at the edge.
// This is only a DEFAULT: the client script lets an explicit user choice
// (localStorage 'lang', set by the header toggle) override it. Non-HTML
// responses pass through untouched.
async function serveAssets(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get("Content-Type") || "";
  if (!type.includes("text/html")) return res;

  const country = (request.headers.get("CF-IPCountry") || "").toUpperCase();
  const lang = country === "KR" ? "ko" : "en";

  const out = new HTMLRewriter()
    .on("html", {
      element(el) {
        el.setAttribute("data-default-lang", lang);
      },
    })
    .transform(res);

  // The default language varies per country, so this HTML must not be stored by
  // a shared/edge cache and replayed to visitors from a different country.
  const headers = new Headers(out.headers);
  headers.set("Cache-Control", "private, no-cache, must-revalidate");
  return new Response(out.body, {
    status: out.status,
    statusText: out.statusText,
    headers,
  });
}

// ─── GET /oauth/auth ───────────────────────────────────────────────────────
// Render the password form. Submission happens via fetch() so the popup
// never navigates and window.opener stays valid for postMessage.

function showLoginForm(): Response {
  const csrf = generateNonce();
  const headers = new Headers({
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
      "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  headers.append(
    "Set-Cookie",
    `${CSRF_COOKIE}=${csrf}; Path=/oauth; Max-Age=${CSRF_TTL_SECONDS}; ` +
      `HttpOnly; Secure; SameSite=Lax`,
  );

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
  text-transform:uppercase;letter-spacing:0.12em;color:#7dc7f5;margin-bottom:8px}
input[type=password]{width:100%;box-sizing:border-box;padding:12px 14px;
  background:rgba(245,230,212,0.04);border:1px solid rgba(245,230,212,0.18);
  border-radius:8px;color:#f5e6d4;font-size:0.95rem;font-family:inherit;
  transition:border-color 0.15s}
input[type=password]:focus{outline:none;border-color:#7dc7f5}
button{width:100%;margin-top:18px;padding:12px;background:#7dc7f5;color:#0a0510;
  border:none;border-radius:8px;font-weight:600;font-size:0.95rem;cursor:pointer;
  transition:background 0.15s}
button:hover{background:#9dd5ff}
button:disabled{opacity:0.5;cursor:not-allowed}
.msg{font-size:0.85rem;margin:0 0 14px;padding:10px 14px;border-radius:8px}
.err{color:#ff6b6b;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.3)}
.ok{color:#6bff8a;background:rgba(107,255,138,0.08);border:1px solid rgba(107,255,138,0.3)}
</style>
</head><body>
<form id="login" autocomplete="off">
  <h1>sunhyuk.dev CMS</h1>
  <p class="sub">Restricted access</p>
  <div id="msg" hidden></div>
  <label for="p">Password</label>
  <input type="password" name="password" id="p" autofocus required>
  <input type="hidden" name="csrf" value="${csrf}">
  <button id="btn" type="submit">Sign in</button>
</form>
<script>
(function(){
  // Capture opener immediately, before anything can clobber it.
  var opener = window.opener;
  var form = document.getElementById('login');
  var btn  = document.getElementById('btn');
  var msg  = document.getElementById('msg');

  function show(text, cls){
    msg.hidden = false;
    msg.className = 'msg ' + cls;
    msg.textContent = text;
  }

  if (!opener) {
    // Should not happen with Decap's window.open, but guard anyway.
    show('This page must be opened from /admin.', 'err');
    btn.disabled = true;
    return;
  }

  // Handshake — netlify-auth-js (which Decap CMS embeds) only arms its
  // success listener after seeing this message from the popup. Without it,
  // the eventual 'authorization:github:success:' message is silently dropped.
  // Resend it periodically until we either get echoed back or the form is
  // submitted, in case the listener attaches a moment after popup opens.
  var handshakeAck = false;
  function sendHandshake(){
    if (handshakeAck) return;
    try { opener.postMessage('authorizing:github', '*'); } catch(_){}
  }
  window.addEventListener('message', function(e){
    if (e.data === 'authorizing:github') handshakeAck = true;
  });
  sendHandshake();
  var handshakeTimer = setInterval(sendHandshake, 200);
  setTimeout(function(){ clearInterval(handshakeTimer); }, 3000);

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    btn.disabled = true;
    msg.hidden = true;
    clearInterval(handshakeTimer);

    try {
      var resp = await fetch('/oauth/auth', {
        method: 'POST',
        credentials: 'same-origin',
        body: new FormData(form),
      });
      var data = await resp.json();

      if (!resp.ok || !data.token) {
        show(data.error || 'Sign-in failed.', 'err');
        btn.disabled = false;
        return;
      }

      // Re-send handshake right before success, in case Decap CMS only
      // installed its listener late.
      try { opener.postMessage('authorizing:github', '*'); } catch(_){}

      var payload = JSON.stringify({ token: data.token, provider: 'github' });
      // Small delay lets Decap process the handshake before the success.
      setTimeout(function(){
        try { opener.postMessage('authorization:github:success:' + payload, '*'); } catch(_){}
        show('Authorized. Closing…', 'ok');
        setTimeout(function(){ try { window.close(); } catch(_) {} }, 800);
      }, 50);
    } catch (err) {
      show('Network error.', 'err');
      btn.disabled = false;
    }
  });
})();
</script>
</body></html>`;

  return new Response(body, { status: 200, headers });
}

// ─── POST /oauth/auth ──────────────────────────────────────────────────────
// Verify CSRF + password (constant-time), respond JSON with PAT or error.

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const jsonHeaders = new Headers({
    ...securityHeaders(),
    "Content-Type": "application/json",
  });

  let password: string;
  let csrf: string;
  try {
    const form = await request.formData();
    password = (form.get("password") as string) || "";
    csrf = (form.get("csrf") as string) || "";
  } catch {
    return new Response(JSON.stringify({ error: "Malformed submission." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const cookieCsrf = readCookie(request, CSRF_COOKIE);
  if (!cookieCsrf || !constantTimeEqual(cookieCsrf, csrf)) {
    return new Response(JSON.stringify({ error: "Session expired. Refresh and try again." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  if (!constantTimeEqual(password, env.CMS_PASSWORD)) {
    // Fixed delay so timing reveals nothing AND throttles brute force.
    await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
    return new Response(JSON.stringify({ error: "Wrong password." }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  // Burn the CSRF cookie — single use.
  jsonHeaders.append(
    "Set-Cookie",
    `${CSRF_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
  return new Response(JSON.stringify({ token: env.GITHUB_PAT }), {
    status: 200,
    headers: jsonHeaders,
  });
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
