import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge sits bottom-left, directly on top of the entity readout — it
  // was covering the HUD in every screenshot we were judging the design by.
  devIndicators: false,
};

export default nextConfig;
