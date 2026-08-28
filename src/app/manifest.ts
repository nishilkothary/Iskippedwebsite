import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iSkipped",
    short_name: "iSkipped",
    description: "Skip what you don't need. Save for what matters.",
    // Authentication is client-side (Firebase), so the PWA must start at the
    // lightweight public entry point rather than the protected app shell.
    start_url: "/sign-in",
    display: "standalone",
    background_color: "#0B1A14",
    theme_color: "#0B1A14",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
