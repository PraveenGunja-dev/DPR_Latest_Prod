import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/dpr-project/api': {
        target: 'http://localhost:3315',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dpr-project\/api/, '/api'),
      },
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

