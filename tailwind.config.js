/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", "system-ui", "Helvetica", "Arial", "sans-serif"],
				serif: ["Lora", "Georgia", "serif"],
			},
			colors: {
				primary: "#4D49F9",
				primaryDark: "#3834DC",
				offWhite: "#F5F5F5",
			},
			keyframes: {
				"fade-in": {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
			},
			animation: {
				"fade-in": "fade-in 0.3s ease-in-out",
			},
		},
	},
	plugins: [],
};
