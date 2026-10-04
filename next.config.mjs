/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the whole app is plain files (Firebase Hosting, any web server, or offline on a range laptop).
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
