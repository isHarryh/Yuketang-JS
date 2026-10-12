import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.js",
      userscript: {
        name: "Yuketang-JS",
        version: "0.7.0",
        description: "A Browser Script to Enhance Yuketang Experience",
        author: "Harry Huang",
        license: "MIT",
        match: ["https://*.yuketang.cn/*"],
        grant: ["GM_notification", "unsafeWindow"],
        // Slide images are downloaded via GM_xmlhttpRequest to bypass CORS
        connect: ["yuketang.cn", "xuetangx.com", "*"],
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
