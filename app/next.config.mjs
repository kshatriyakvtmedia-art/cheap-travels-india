/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 + playwright are native — keep them external on server bundle
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright'],
  },
};
export default nextConfig;
