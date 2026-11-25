import { defineConfig } from "vite";

export default defineConfig({
  // The app tsconfig preserves JSX for Next.js; the standalone Vite harness
  // must transform TSX before Vite's import-analysis phase.
  esbuild: {
    jsx: "automatic",
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react-jsx"
      }
    }
  }
});
