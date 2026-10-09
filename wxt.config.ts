import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: "Bookmarks 2 Hub - 书签备份到 Git 仓库",
    description: "在不同浏览器之间同步书签，支持 GitHub Gist 与 Gitee 代码片段作为存储",
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
