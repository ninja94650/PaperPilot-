// The app tsconfig preserves JSX for Next.js; this standalone Vite harness
// must transform TSX before Vite's import-analysis phase.
export default {
  esbuild: {
    jsx: "automatic",
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react-jsx"
      }
    }
  }
};
