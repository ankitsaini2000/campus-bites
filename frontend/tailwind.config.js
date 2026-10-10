/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        // "Vibrant Canteen" brand palette (Stitch design system, seed #F97316)
        brand: {
          50: "#FFF7ED",
          100: "#FFEDD5",
          200: "#FED7AA",
          300: "#FDBA74",
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
          800: "#9A3412",
          900: "#7C2D12",
        },
        cream: "#FFF7ED",
        ink: {
          DEFAULT: "#1C1917",
          soft: "#44403C",
          mute: "#78716C",
        },
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(28, 25, 23, 0.12)",
        lift: "0 14px 36px -12px rgba(28, 25, 23, 0.20)",
      },
    },
  },
  plugins: [],
};
