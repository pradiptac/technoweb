import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is one workspace inside the repo; pin the root so Turbopack does
  // not walk up and pick a lockfile from a sibling directory.
  turbopack: { root: __dirname },

  poweredByHeader: false,
  reactStrictMode: true,

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
