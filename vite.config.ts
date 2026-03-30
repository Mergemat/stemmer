import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isTest = process.env.VITEST === "true";

const config = defineConfig({
	plugins: [
		devtools(),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart(),
		viteReact(
			isTest
				? undefined
				: {
						babel: {
							plugins: ["babel-plugin-react-compiler"],
						},
					},
		),
	],
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	test: {
		environment: "jsdom",
	},
});

export default config;
