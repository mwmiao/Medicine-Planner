import type { NextConfig } from "next";

// Exportação estática: a app não precisa de servidor e pode ser servida
// gratuitamente (Vercel, Netlify, GitHub Pages). Todos os dados ficam no
// IndexedDB do próprio iPhone.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
