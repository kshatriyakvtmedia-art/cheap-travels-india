/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // HTTPS only (1 year, subdomains, preload)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Referrer: send origin only on cross-site, full URL same-site
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Lock down browser feature APIs
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // CSP: kept loose on script-src because public/index.html uses inline scripts.
          // Tighten once the frontend moves to Next.js pages with nonce support.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-inline required by inline scripts in public/index.html
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              // data: for inline QR images; https: for external images (bus operators etc.)
              "img-src 'self' data: https: blob:",
              // API calls: own origin + WhatsApp Cloud API + QR generator
              "connect-src 'self' https://graph.facebook.com https://api.qrserver.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      // / is now the Next.js home page (app/app/page.js) — no rewrite needed
      { source: '/admin',      destination: '/admin.html' },
      { source: '/about',      destination: '/about.html' },
      { source: '/mobile',     destination: '/mobile/index.html' },
      { source: '/02-brain-map', destination: '/02-brain-map.html' },
    ];
  },
};

export default nextConfig;
