import { defineConfig } from "tsup";
export default defineConfig((options) => (Object.assign({ entry: ["src/index.ts"], format: ["esm"], dts: true, clean: true }, options)));
