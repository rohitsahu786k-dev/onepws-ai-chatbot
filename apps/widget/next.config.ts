import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@onepws/config", "@onepws/types", "@onepws/ui", "@onepws/utils"],
};

export default nextConfig;
