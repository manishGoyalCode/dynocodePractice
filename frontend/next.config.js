/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Required for Static Export to work with some Next.js features
  images: {
    unoptimized: true,
  },
  // If you use a custom domain, you can set trailingSlash to true for better SEO
  trailingSlash: true,
};

module.exports = nextConfig;
