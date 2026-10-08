import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: "BookmarkHub - 书签同步",
    description: "在不同浏览器之间通过 GitHub Gist 同步书签",
    permissions: ['storage', 'bookmarks', 'notifications'],
    host_permissions: ["https://*.github.com/", "https://*.githubusercontent.com/"],
    optional_host_permissions: [
      "*://*/*",
    ]
  }
});
