/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#0E7B4F',
          'green-d': '#094B30',
          teal: '#14B58C',
          orange: '#EE8C2E',
          'orange-s': '#FBE2C3',
          ink: '#0B1220',
          'ink-2': '#475569',
          'ink-3': '#94A3B8',
          surface: '#FAFAF7',
          line: '#E5E7EB',
        },
      },
      fontFamily: {
        head: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 8px rgba(14,123,79,.06)',
        card: '0 10px 28px rgba(14,123,79,.10)',
        lg2: '0 18px 50px rgba(14,123,79,.16)',
      },
    },
  },
  plugins: [],
};
