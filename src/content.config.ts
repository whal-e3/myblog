import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    publishDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    starred: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    comments: z.boolean().default(true),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    period: z.string().optional(),
    status: z.enum(["active", "shipped", "concluded", "upcoming", "archived"]).default("active"),
    featured: z.boolean().default(false),
    order: z.number().default(0),
    cover: z.string().optional(),
    coverVideo: z.string().optional(),
    links: z
      .array(z.object({ label: z.string(), url: z.string() }))
      .default([]),
    posts: z.array(z.string()).default([]),  // blog post slugs related to this project
  }),
});

export const collections = { blog, projects };
