// Vitest browser mode runs through Vite, not Rsbuild. Keep this PostCSS
// bridge so browser visual tests compile the same Tailwind utilities that
// production builds get from @rsbuild/plugin-tailwindcss.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
