import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { subwayPreview } from "./scripts/subway-preview.mjs";

const liveServer = process.env.SUBWAY_API_PROXY_TARGET || process.env.SUBWAY_MAP_PROXY_TARGET || "http://127.0.0.1:8787";

function localProxy(target) {
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      // The Python server accepts only its own Origin for quota protection.
      proxy.on("proxyReq", (request, incoming) => {
        if (incoming.headers.origin) {
          request.setHeader("Origin", new URL(target).origin);
        }
      });
      proxy.on("error", (_error, _request, response) => {
        if (!response || response.headersSent || response.writableEnded) return;
        response.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(JSON.stringify({ error: "Local subway feed server is unavailable." }));
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
    plugins: [subwayPreview(), {
      name: "subway-local-feed-origin",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
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
        "^/api/live/": localProxy(liveServer),
      },
      watch: {
        usePolling: true,
        interval: 400,
      },
    },
  },
});
