export default {
  manifest_version: 3,
  name: "Chiss — Move Tree Tracker",
  description: "Reads Chess.com moves from DOM and builds a Move Tree with variations, FEN positions, and current state tracking.",
  version: "0.1.0",
  permissions: ["activeTab"],
  content_scripts: [
    {
      matches: ["*://*.chess.com/*"],
      js: ["src/content/index.ts"],
    },
  ],
  action: {
    default_popup: "src/popup/index.html",
  },
  icons: {},
};
