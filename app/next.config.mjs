/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright'],
  },

  async headers() {
    return [
      {
        // Security + cache headers applied to every route.
        // Cache-Control: no-cache means the browser must revalidate before
        // using a cached copy — so every deploy is picked up on next refresh
        // without users needing to manually clear cache.
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https://graph.facebook.com https://api.qrserver.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          // Explicit no-cache on HTML so browsers always revalidate.
          // Vercel edge cache is invalidated automatically on every deploy,
          // so a fresh deploy is visible to everyone on next page load.
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
      {
        // Content-hashed bundles (/_next/static/) CAN be cached forever:
        // a new deploy changes the hash → new filename → cache miss naturally.
        // This overrides the no-cache set above for these paths.
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // Old confirmation URL → canonical booking URL
      { source: '/confirmation/:id', destination: '/booking/:id', permanent: true },
      // Old results URL → homepage (from/to not available in old query-param form for slug conversion)
      { source: '/results', destination: '/', permanent: false },
      // Old seat-selection URL → homepage (busId alone can't reconstruct the route slug)
      { source: '/select-seats/:busId', destination: '/', permanent: false },
    ];
  },

  async rewrites() {
    return {
      // beforeFiles runs BEFORE App Router page matching — required so
      // app/app/page.js doesn't shadow the HTML SPA at /
      beforeFiles: [
        { source: '/', destination: '/index.html' },
      ],
      afterFiles: [
        { source: '/admin',        destination: '/admin.html' },
        { source: '/about',        destination: '/about.html' },
        { source: '/mobile',       destination: '/mobile/index.html' },
        { source: '/02-brain-map', destination: '/02-brain-map.html' },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
