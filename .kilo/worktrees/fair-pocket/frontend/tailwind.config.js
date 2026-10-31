/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        adobe: {
          bg: "#1e222b",
          pod: "#2a2f3d",
          header: "#1f2430",
          bar: "#161922",
          border: "#3a4153",
          accent: "#2563eb",
          text: "#f3f4f6",
          muted: "#9ca3af",
          host: "#eab308",
          presenter: "#3b82f6",
          participant: "#10b981",
        },
      },
    },
  },
  plugins: [],
};
