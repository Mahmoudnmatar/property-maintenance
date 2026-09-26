import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  images: {
    // Disable default optimizer for private images – served via signed route
    unoptimized: false,
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);
