/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 + playwright are native — keep them external on server bundle
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright'],
  },
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/index.html',
      },
      {
        source: '/admin',
        destination: '/admin.html',
      },
      {
        source: '/about',
        destination: '/about.html',
      },
      {
        source: '/mobile',
        destination: '/mobile/index.html',
      },
      {
        source: '/02-brain-map',
        destination: '/02-brain-map.html',
      },
    ];
  },
};
export default nextConfig;
