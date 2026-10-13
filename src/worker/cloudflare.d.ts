// Wrangler supplies this runtime module. This narrow declaration lets the
// repository type-check without requiring Cloudflare types for the Astro app.
declare module "cloudflare:workers" {
  export class DurableObject {
    constructor(ctx: unknown, env: unknown);
  }
}
