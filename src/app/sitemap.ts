import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://nextinstock.com/", priority: 1 },
    { url: "https://nextinstock.com/docs", priority: 0.8 },
  ];
}
