import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://sunhyuk.dev",
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-dark",
        dark: "github-dark",
      },
    },
  },
  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 400,
      },
    },
  },
});
