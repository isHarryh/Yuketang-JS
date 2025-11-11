import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.js",
      userscript: {
        name: "Yuketang-JS",
        version: "0.1.0",
        description: "A Browser Script to Enhance Yuketang Experience",
        author: "Harry Huang",
        license: "MIT",
        match: ["https://*.yuketang.cn/*"],
        grant: ["GM_notification"],
        source: "https://github.com/isHarryh/Yuketang-JS",
        namespace: "https://www.yuketang.cn/",
        "run-at": "document-start",
      },
      server: {
        mountGmApi: true,
      },
    }),
  ],
});
