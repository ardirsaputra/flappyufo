import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow pages/api + app router hybrid
  serverExternalPackages: ["pg"],

  // Allow ngrok and any tunnel/proxy to access the dev server
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.loca.lt",
    "*.trycloudflare.com",
    "*.lhr.life",
  ],

  // Allow server actions from tunnel origins
  experimental: {
    serverActions: {
      allowedOrigins: [
        "*.ngrok-free.app",
        "*.ngrok.io",
        "*.ngrok.app",
        "*.loca.lt",
        "*.trycloudflare.com",
        "*.lhr.life",
      ],
    },
  },
};

export default nextConfig;
