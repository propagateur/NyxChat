import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri pilote le dev server : port fixe, et on n'efface pas la console pour
// garder les logs de cargo lisibles.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
