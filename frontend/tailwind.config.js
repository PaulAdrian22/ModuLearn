/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary / Accent Color - Deep Academic Navy (structure and professionalism)
        primary: {
          DEFAULT: '#0B2B4C',
          light: '#1e5a8e',
          dark: '#081f36',
          highlight: '#2BC4B3',
        },
        // Secondary Color - Dark Emerald Blue (secondary actions, icons)
        secondary: {
          DEFAULT: '#1e5a8e',
          light: '#2f6fa8',
          dark: '#164570',
        },
        // Highlight Color - Fresh Learning Teal (hover states, active elements)
        highlight: {
          DEFAULT: '#2BC4B3',
          light: '#4DD0E1',
          dark: '#1a9d8f',
        },
        // Background Colors - Soft Learning-Friendly Off-White
        background: {
          DEFAULT: '#F5F7FA',
          dark: '#E8EEF5',
          light: '#FFFFFF',
        },
        // Surface / Card Background - Light Gray-Blue (cards, modules, panels)
        surface: {
          DEFAULT: '#FFFFFF',
          light: '#F8FAFC',
          dark: '#EDF2F7',
        },
        // Border / Divider Color - Gentle Cool Gray
        border: {
          DEFAULT: '#D1D5DB',
          light: '#E5E7EB',
          dark: '#9CA3AF',
        },
        // Text Colors - High readability
        text: {
          primary: '#0B2B4C',
          secondary: '#4B5563',
          muted: '#6B7280',
          link: '#1e5a8e',
        },
        // Feedback Colors - Clear and instructional
        success: '#4CAF50',
        warning: '#F39C12',
        error: '#EF5350',
        info: '#4A90E2',
        // Button-specific colors
        button: {
          primary: '#1e5a8e',
          secondary: '#2BC4B3',
          hover: '#1a9d8f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
