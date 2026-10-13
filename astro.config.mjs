import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const subwayServer = "http://127.0.0.1:8787";
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
