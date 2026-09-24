/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@mahsoob/brand',
    '@mahsoob/ui',
    '@mahsoob/types',
    '@mahsoob/config',
    '@mahsoob/utils',
    '@mahsoob/validation',
    '@mahsoob/server',
  ],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      // Cloudflare R2 public bucket — where uploaded product/category/promotion
      // images live (see S3_PUBLIC_URL). The per-bucket subdomain varies, so allow
      // any `*.r2.dev` host. Without this the Next image optimizer 400s these URLs
      // and the browser shows a broken image, even though the file itself is public.
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      // Local MinIO (docker-compose), the dev-only stand-in for the R2 bucket above. Already
      // allowed by the app's CSP img-src; without this Next's own remotePatterns check still
      // blocks it independently of `unoptimized`.
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9002',
      },
    ],
  },
};

export default nextConfig;
