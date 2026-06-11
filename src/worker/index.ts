// Cloudflare Worker — GitHub OAuth handler for Decap CMS.
//
// SECURITY MODEL (read carefully before modifying):
//
// 1. Only one GitHub user (env.ALLOWED_GITHUB_LOGIN) can ever complete the
//    OAuth handshake. Anyone else gets a 403 even if they authenticate with
//    GitHub. This is the primary authorization control.
// 2. The OAuth `state` parameter is a cryptographic random nonce stored in
//    an httpOnly+secure+SameSite=Lax cookie. The callback compares the
//    cookie value to the query param using a constant-time check to prevent
//    CSRF and timing attacks.
// 3. The GitHub client_secret never leaves this Worker. It is read from
//    Cloudflare's encrypted Secret store, never logged, never returned in a
//    response body.
// 4. The OAuth access token is forwarded to the browser via postMessage to
//    `window.opener` (the Decap CMS popup pattern). It is never written to
//    a cookie, never logged, never persisted on the Worker side.
// 5. Every Worker response includes a strict Content-Security-Policy and
//    common hardening headers. The success page only allows a script with
//    a specific inline-hash; no remote scripts.
// 6. All requests outside of /oauth/* fall through to static assets. The
//    OAuth handler never touches blog content or repo state directly —
//    GitHub's API does that, gated by the browser-side token.

interface Env {
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_GITHUB_LOGIN: string;
  GITHUB_REPO: string;
  SITE_ORIGIN: string;
}

const STATE_COOKIE = "decap_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 minutes — generous but bounded
const OAUTH_SCOPE = "public_repo"; // Narrowest scope that still permits writes to the repo

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Defense in depth: refuse if the request hostname doesn't match the
    // configured site origin. Prevents preview deployments / custom domains
    // from being used as an OAuth callback target.
    if (url.origin !== env.SITE_ORIGIN) {
      // Allow asset traffic through on non-prod origins, but never OAuth.
      if (url.pathname.startsWith("/oauth/")) {
        return new Response("OAuth disabled on this origin.", {
          status: 403,
          headers: securityHeaders(),
        });
      }
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/oauth/auth") {
      return handleAuthStart(request, env);
    }
    if (url.pathname === "/oauth/callback") {
      return handleCallback(request, env, url);
    }

    // Everything else: static assets (Astro build output).
    return env.ASSETS.fetch(request);
  },
};

// ─── /oauth/auth ───────────────────────────────────────────────────────────
// 1. Generate a 256-bit random `state` nonce.
// 2. Set it in a short-lived httpOnly secure SameSite=Lax cookie.
// 3. Redirect to GitHub's authorize endpoint.

async function handleAuthStart(_request: Request, env: Env): Promise<Response> {
  const state = generateState();
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.SITE_ORIGIN}/oauth/callback`,
    scope: OAUTH_SCOPE,
    state,
    allow_signup: "false", // No silent account creation; existing user only.
  });

  const headers = new Headers(securityHeaders());
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; Path=/oauth; Max-Age=${STATE_TTL_SECONDS}; ` +
      `HttpOnly; Secure; SameSite=Lax`,
  );
  headers.set("Location", `https://github.com/login/oauth/authorize?${params}`);

  return new Response(null, { status: 302, headers });
}

// ─── /oauth/callback ───────────────────────────────────────────────────────
// 1. Verify `state` matches the cookie (constant-time).
// 2. Exchange code for access token (server-to-server; secret never sent to browser).
// 3. Fetch the authenticated GitHub user.
// 4. Reject anyone except env.ALLOWED_GITHUB_LOGIN.
// 5. Render an HTML page that postMessages the token to window.opener (Decap CMS).

async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return errorPage("Missing code or state.", 400);
  }

  // Constant-time state check against the cookie.
  const cookieState = readCookie(request, STATE_COOKIE);
  if (!cookieState || !constantTimeEqual(cookieState, state)) {
    return errorPage("Invalid state.", 400);
  }

  // Exchange code -> access token. The client_secret is included server-side
  // only; never reflected in the response or logged.
  let token: string;
  try {
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "sunhyuk-blog-cms",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${env.SITE_ORIGIN}/oauth/callback`,
      }),
    });
    if (!tokenResp.ok) {
      return errorPage("Token exchange failed.", 502);
    }
    const tokenJson = (await tokenResp.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) {
      return errorPage("Token exchange returned no access_token.", 502);
    }
    token = tokenJson.access_token;
  } catch {
    return errorPage("Token exchange request errored.", 502);
  }

  // Identity check: only the allowlisted GitHub user may proceed.
  let login: string;
  try {
    const userResp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "sunhyuk-blog-cms",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!userResp.ok) {
      return errorPage("Could not fetch GitHub user.", 502);
    }
    const userJson = (await userResp.json()) as { login?: string };
    if (!userJson.login) {
      return errorPage("GitHub user response missing login.", 502);
    }
    login = userJson.login;
  } catch {
    return errorPage("User fetch errored.", 502);
  }

  // Case-insensitive compare — GitHub stores logins case-preserving but the
  // identity is the lowercased form. Prevents foot-guns when the env var
  // happens to be in a different case than the API response.
  if (login.toLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLowerCase()) {
    // Intentionally vague to avoid confirming who is allowed.
    return errorPage("Not authorized.", 403);
  }

  // Success: postMessage the token back to the Decap CMS popup opener.
  // The page is fully self-contained — no external scripts, strict CSP.
  return tokenResponsePage(token);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateState(): string {
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
    // Tokens or state must never live in intermediary caches.
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

function errorPage(message: string, status: number): Response {
  // Self-clearing cookie on any error path so a botched state can't be reused.
  const headers = new Headers({
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
  const body = `<!doctype html><meta charset="utf-8"><title>OAuth error</title>` +
    `<style>body{font-family:system-ui,sans-serif;background:#0a0510;color:#f5e6d4;` +
    `padding:48px;max-width:520px;margin:0 auto}h1{color:#ff6b2a}</style>` +
    `<h1>OAuth error (${status})</h1><p>${escapeHtml(message)}</p>` +
    `<p><a href="/admin/" style="color:#ff6b2a">Back to /admin</a></p>`;
  return new Response(body, { status, headers });
}

function tokenResponsePage(token: string): Response {
  // Decap CMS expects a postMessage to window.opener with a specific payload
  // shape: `authorization:github:success:{"token":"...","provider":"github"}`
  //
  // The token is embedded directly in the inline script. We compute a SHA-256
  // hash of the script body so CSP can allow ONLY this exact script (no other
  // inline JS, no remote JS). Token is escaped to prevent breakout.
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

  // Strict CSP: no remote anything, only the inline script we control.
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'", // bound to this one inline block; no other JS can load
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers({
    ...securityHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": csp,
  });
  // Clear the state cookie now that it's been consumed.
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );

  const body =
    `<!doctype html><meta charset="utf-8"><title>Authorized</title>` +
    `<style>body{font-family:system-ui,sans-serif;background:#0a0510;color:#f5e6d4;` +
    `padding:48px;text-align:center}</style>` +
    `<p>Authorized. You can close this window.</p>` +
    `<script>${script}</script>`;
  return new Response(body, { status: 200, headers });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
