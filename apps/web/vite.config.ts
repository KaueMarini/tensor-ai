import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // código puro compartilhado com as Edge Functions (tipos, mappers, futuro motor)
      "@shared": fileURLToPath(new URL("../../supabase/functions/_shared", import.meta.url)),
    },
  },
  server: { port: 5173 },
});
