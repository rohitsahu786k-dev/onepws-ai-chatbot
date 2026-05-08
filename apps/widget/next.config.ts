import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
  transpilePackages: ["@onepws/config", "@onepws/types", "@onepws/ui", "@onepws/utils"],
};

export default nextConfig;
