import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is one workspace inside the repo; pin the root so Turbopack does
  // not walk up and pick a lockfile from a sibling directory.
  turbopack: { root: __dirname },

  poweredByHeader: false,
  reactStrictMode: true,

  // `next dev` treats requests carrying an Origin from a host it does not
  // recognise as cross-origin and answers 403 — including its own JS chunks.
  // It considers localhost canonical, so browsing dev at 127.0.0.1 silently
  // serves pages whose client bundle never loads: no hydration, no
  // client-side JS, and no error beyond a 403 in the console. scripts/audit.mjs
  // defaults to 127.0.0.1, so without this an audit passes against a page
  // that is dead client-side. Dev only; `next start` does no such check.
  allowedDevOrigins: ["127.0.0.1"],

  images: {
    // Product images, case-study covers and media-library uploads are served
    // by the Laravel API. Add the production API host before launch.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/storage/**" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
