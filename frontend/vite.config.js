import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

// Plugin to copy PDF.js worker file to public directory
const copyPdfWorker = () => {
  return {
    name: "copy-pdf-worker",
    buildStart() {
      const nodeModulesPath = resolve(__dirname, "node_modules");
      const pdfJsPath = resolve(nodeModulesPath, "pdfjs-dist");
      const workerSrc = resolve(pdfJsPath, "build", "pdf.worker.min.js");
      const destDir = resolve(__dirname, "public");

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = resolve(destDir, "pdf.worker.min.js");

      try {
        fs.copyFileSync(workerSrc, destPath);
        console.log("PDF.js worker file copied to public directory");
      } catch (error) {
        console.error("Failed to copy PDF.js worker file:", error);
      }
    },
    writeBundle() {
      // Also copy to the dist directory during build
      const nodeModulesPath = resolve(__dirname, "node_modules");
      const pdfJsPath = resolve(nodeModulesPath, "pdfjs-dist");
      const workerSrc = resolve(pdfJsPath, "build", "pdf.worker.min.js");
      const destDir = resolve(__dirname, "dist");

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = resolve(destDir, "pdf.worker.min.js");

      try {
        fs.copyFileSync(workerSrc, destPath);
        console.log("PDF.js worker file copied to dist directory");
      } catch (error) {
        console.error("Failed to copy PDF.js worker file to dist:", error);
      }
    },
  };
};

export default defineConfig({
  plugins: [react(), copyPdfWorker()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
