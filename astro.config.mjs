import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const subwayServer = process.env.SUBWAY_MAP_PROXY_TARGET || "http://127.0.0.1:8787";
const liveServer = process.env.SUBWAY_API_PROXY_TARGET || subwayServer;

function localProxy(target, rewrite) {
  return {
    target,
    changeOrigin: true,
    rewrite,
    configure(proxy) {
      // The Python server accepts only its own Origin for quota protection.
      proxy.on("proxyReq", (request, incoming) => {
        if (incoming.headers.origin) {
          request.setHeader("Origin", new URL(target).origin);
        }
      });
      proxy.on("error", (_error, _request, response) => {
        if (!response || response.headersSent || response.writableEnded) return;
        if (rewrite) {
          response.writeHead(503, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Subway preview server stopped</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:12vh auto;padding:0 1.5rem;color:#14243b}code{background:#edf3f8;padding:.2em .4em;border-radius:4px}</style><h1>Start the subway preview server</h1><p>In another terminal, run <code>cd seoul-subway-3d-live &amp;&amp; python3 server.py</code> from the blog directory, then reload this page.</p><p>The map works without an API key; live trains require your local <code>.env</code>.</p></html>`);
        } else {
          response.writeHead(503, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          response.end(JSON.stringify({ error: "Local subway feed server is unavailable." }));
        }
      });
    },
  };
}

export default defineConfig({
  site: "https://sunhyuk.dev",
  integrations: [mdx(), sitemap()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      themes: {
        light: "github-dark",
        dark: "github-dark",
      },
    },
  },
  vite: {
    plugins: [{
      name: "subway-preview-trailing-slash",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/miniprj/seoul-subway") {
            response.writeHead(308, { Location: "/miniprj/seoul-subway/" });
            response.end();
            return;
          }
          if (request.url?.startsWith("/api/live/")) {
            let sameOrigin = true;
            try {
              if (request.headers.origin) {
                sameOrigin = new URL(request.headers.origin).host === request.headers.host;
              }
            } catch {
              sameOrigin = false;
            }
            if (!sameOrigin || request.headers["sec-fetch-site"] === "cross-site") {
              response.writeHead(403);
              response.end("Cross-site feed requests are disabled in local preview.");
              return;
            }
          }
          next();
        });
      },
    }],
    server: {
      proxy: {
        "^/miniprj/seoul-subway/": localProxy(
          subwayServer,
          (path) => path.replace(/^\/miniprj\/seoul-subway/, ""),
        ),
        "^/api/live/": localProxy(liveServer),
      },
      watch: {
        usePolling: true,
        interval: 400,
      },
    },
  },
});
