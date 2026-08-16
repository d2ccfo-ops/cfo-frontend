/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required to run this app in a container. `next build` normally leaves you
  // needing the whole repo and all of node_modules to `next start`; standalone
  // emits .next/standalone/server.js with only the files actually reached,
  // traced from the import graph. The runtime image drops from ~1.2GB to
  // ~200MB, which is most of a Cloud Run cold start.
  output: "standalone",
};

export default nextConfig;
