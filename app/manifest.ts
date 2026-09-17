import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Purchasing Management System",
    short_name: "PMS",
    description: "Complete purchasing, routing, delivery, document and supplier evaluation workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#071a16",
    theme_color: "#0b5d4a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ]
  };
}