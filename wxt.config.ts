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
    host_permissions: [
      "https://*.github.com/",
      "https://*.githubusercontent.com/",
      "https://gitee.com/",
      "https://*.gitee.com/",
    ],
    optional_host_permissions: [
      "*://*/*",
    ]
  },
  // Firefox 审核用的源码包只需要能构建出扩展的文件。默认会把仓库里
  // 已提交的发行 zip 一起打进去，导致每发一版体积翻倍累积。
  zip: {
    excludeSources: [
      '**/*.zip',
      'releases/**',
      'chrome-extension-build/**',
      'images/**',
      '.codegraph/**',
    ],
  }
});
