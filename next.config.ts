import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude tldraw from the server bundle — it uses DOM APIs that crash
  // during Next.js App Router server pre-rendering.
  // This is the official tldraw recommendation for Next.js (see tldraw/nextjs-template).
  serverExternalPackages: ['tldraw', '@tldraw/editor', '@tldraw/tldraw'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
