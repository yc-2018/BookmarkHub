# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指引。

## 项目概述

产品名是 **Bookmarks 2 Hub**（manifest 显示名、弹窗品牌栏、设置页标题、README 标题），一个跨浏览器扩展，以 GitHub Gist 或 Gitee 代码片段作为存储，在 Chrome、Firefox、Edge 之间同步书签。技术栈为 WXT + React + TypeScript。

三样东西沿用旧名 **BookmarkHub**，改名时不要动：仓库名 `yc-2018/BookmarkHub`；`package.json` 的 `name: "bookmarkhub"`（发行包文件名 `bookmarkhub-<版本>-*.zip` 和 CI 工作流的通配符由它派生）；默认文件名 `BookmarkHub`（已有用户的 Gist 里就是这个名字，改了会读不到）。

同步是**纯手动**的：上传、下载、对比都由用户在弹窗里主动触发。早期版本的自动同步已移除 —— MV3 的 service worker 空闲即终止，`setInterval` 随之消失，而项目并未申请 `alarms` 权限，该机制实际不可靠。不要重新引入基于定时器的后台同步。

## 开发命令

项目用 **pnpm**（`packageManager` 已锁定版本，lockfile 为 v9）。

```bash
pnpm install                   # 安装依赖，postinstall 会自动执行 wxt prepare

pnpm run dev                   # Chrome 开发模式（监听改动）
pnpm run dev:firefox           # Firefox 开发模式

pnpm run compile               # 类型检查（tsc --noEmit），提交前必跑
pnpm run build                 # 构建 Chrome，产出 .output/chrome-mv3/
pnpm run build:firefox         # 构建 Firefox，产出 .output/firefox-mv2/

pnpm run zip                   # 打包 Chrome -> .output/bookmarkhub-<版本>-chrome.zip
pnpm run zip:firefox           # 打包 Firefox，同时产出审核用的 sources.zip
```

注意 `build` 只产出未打包目录，**zip 文件来自 `zip` 命令**。

## 发版流程

每次改完代码都要走完整条链路，不要停在提交。

```bash
# 1. 提交前自检
pnpm run compile                       # 类型检查
pnpm install --frozen-lockfile         # 确认 lockfile 未漂移（CI 第一步就靠它）
git status                             # 工作区必须干净
git fetch origin && git status -sb     # 必须与 origin/main 同步

# 2. 提交

# 3. 改版本号并打标签
#    修复/界面微调 -> patch，新功能 -> minor，破坏性变更 -> major
npm version patch -m "chore: Bump version to %s"

# 4. 推送分支与标签（标签才是触发发版的东西）
git push origin main --follow-tags

# 5. 确认发布成功，不要假定
#    本机没有 gh CLI，用 curl 查 API
curl -s "https://api.github.com/repos/yc-2018/BookmarkHub/actions/runs?per_page=1"
curl -s "https://api.github.com/repos/yc-2018/BookmarkHub/releases/tags/v<版本>"

# 6. 重新生成本地包（先删旧的，否则会留下版本号对不上的陈旧 zip）
rm -f .output/*.zip && pnpm run zip && pnpm run zip:firefox
```

几个会踩的点：

- **标签触发的工作流用的是「该标签所指提交」上的 workflow 文件**。修完 CI 后光重跑没用，必须把标签移到含修复的提交上。
- 工作流会校验标签与 `package.json` 版本一致，不一致直接失败 —— 防止忘记改版本号就打标签。
- 同一标签重跑会覆盖产物，不会报「Release 已存在」。
- 查不到失败原因时：job 日志需要仓库 admin 权限（匿名返回 403），但 `check-runs/<job_id>/annotations` 接口匿名可读，失败信息在里面。
- 本地包和 CI 包永远不会字节相同 —— HTML 的行尾符本地是 CRLF、CI 是 LF。怀疑有差异时先用 `tr -d '\r'` 逐文件比对哈希再下结论。

## 架构

### 框架与构建

- **WXT** 负责生成 manifest 和整个构建流程
- `wxt.config.ts` 定义扩展 API、权限、manifest 字段，以及 `zip.excludeSources`
- 入口位于 `src/entrypoints/`：`background.ts`、`popup/`、`options/`

### 后台服务（`src/entrypoints/background.ts`）

所有书签写操作的唯一出口，同时是弹窗的消息中枢。

- 消息分发：`upload` / `download` / `removeAll` / `compare`（设置已并入弹窗标签页，不再有 `setting` 消息）
- 对外操作：`uploadBookmarks()`、`downloadBookmarks(remoteBookmarks?)`、`removeAllBookmarks()`、`compareBookmarks()`
- 内部实现：`clearBookmarkTree()`、`createBookmarkTree()`、`getBookmarks()`、`refreshLocalCount()`
- 监听书签变动，在非同步期间点亮「有未同步改动」角标

### 同步流程

1. **上传**：读本地树 → 归一化根目录名并剥除浏览器私有字段 → 包成 `SyncDataInfo` → PATCH 到 Gist
2. **下载**：拉 Gist → 清空本地树 → 按当前浏览器的 ID 规则重建
3. **对比**：拉 Gist → 与本地归一化树比对 → 返回 `DiffResult`，**同时回传远端树**，供用户随后选择「下载覆盖本地」时复用，避免二次请求

### 工具层（`src/utils/`）

| 文件 | 职责 |
|---|---|
| `bookmarks.ts` | 书签树处理：`formatBookmarks`（归一化，**深拷贝不改入参**）、`getBookmarkCount`、`detectBrowserType`、根目录中文展示名映射 |
| `diff.ts` | 本地与远端比对：`flattenBookmarks`、`diffBookmarks`、`DiffResult` |
| `messages.ts` | 弹窗与后台之间的消息类型 `OperMessage` / `OperResult`，以及 `sendOper()` |
| `services.ts` | `BookmarkService`，封装代码片段的读写；Gitee 分支负责 emoji 转义与 JSON 请求体 |
| `http.ts` | `createClient(setting)`，按所选平台创建 ky 客户端并注入各自的认证方式 |
| `setting.ts` | `Setting.build()` 读取配置 |
| `optionsStorage.ts` | webext-options-sync 的默认值定义 |
| `models.ts` | `BookmarkInfo`、`SyncDataInfo` 及各枚举 |
| `update.ts` | 检查更新：`compareVersions`（按点分段数值比较）、`checkForUpdate`（拉 GitHub `releases/latest` 与 `manifest.version` 比对） |

弹窗与后台共用 `bookmarks.ts` / `diff.ts`，所以这些函数**不能依赖后台特有的运行环境**。

## 关键技术细节

### 浏览器差异

- Firefox 根节点 ID 为 `"root________"`，Chrome 为数字 `"0"`/`"1"`/`"2"`/`"3"`
- 归一化时统一换成 `RootBookmarksType` 的标识名（`ToolbarFolder` 等），下载时再按目标浏览器映射回去
- **`RootBookmarksType` 的枚举值是已存 Gist 的在线格式，改了会破坏兼容性，只能在展示层映射成中文**
- Firefox 构建为 MV2，`browser.action` 不存在（MV2 是 `browser_action`）。后台用 `browser.action ?? browser.browserAction` 回退，新增角标相关代码必须沿用

### 扩展 ID 与 manifest 的 `key` 字段

`wxt.config.ts` 里的 `EXTENSION_KEY` 是一把 RSA 公钥（base64 的 SPKI DER），Chrome/Edge 构建的 manifest 带 `key` 字段，Firefox 构建不带 —— manifest 用函数形式按 `env.browser` 区分，Firefox 用的是 `browser_specific_settings.gecko.id`，这个字段对它没有意义。**这个值一旦发布就不能改**：扩展 ID = SHA-256(DER 公钥) 前 16 字节、十六进制按 0-f → a-p 映射，固定为 `cagopejcnnfcecidchgcgobaaiikgkgb`；改了等于换 ID，而 `storage` 按 ID 隔离，所有用户的令牌和片段 ID 都要重填。私钥没有保留：2026-10-09 生成后即删除，无备份，也无法从公钥反推。它只在打签名 crx 或上架商店时才用得到，而本项目只走 zip + 加载已解压 —— 构建、CI、发版、覆盖安装全都不需要它。将来若真要打 crx，只能换新钥匙，等于换 ID、全员迁移一次。

为什么必须有它（2026-10-09 在本机 Chrome 155 上实测，不是推断）：Chromium 把拖进 `chrome://extensions` 的 zip 当作「已解压扩展」安装，解压到 `<profile>/UnpackedExtensions/<包名>_<进程号>_<随机数>/`；没有 `key` 的已解压扩展，ID 来自**解压目录绝对路径**的哈希（`crx_file::id_util::GenerateIdForPath`，Windows 下取路径的 UTF-16LE 字节）。目录名每次都不同 → ID 每次都不同 → 每拖一次就多一条「新扩展」，而且新的那条 storage 是空的、永远停在未配置状态。用户 Chrome 里残留的 `UnpackedExtensions\bookmarkhub-1.0.2-chrome_28692_553569640` 目录和 ID `haedikijkpbmanjmahmpoleebeijcphi` 就是这么来的，按上述算法从该路径算出的 ID 与之完全一致。有了 `key`，ID 与路径无关，再装就是原地覆盖。

验证办法（不用碰 UI）：用 `--remote-debugging-pipe --enable-unsafe-extension-debugging --user-data-dir=<临时目录>` 启动 Chrome，通过 CDP 的 `Extensions.loadUnpacked` 从两个不同目录各装一次 —— 这走的就是拖 zip 时用的 UnpackedInstaller，只少了解压那一步。两次返回的 ID 都应是上面那个值，`Browser.close` 正常关闭后 `Default/Secure Preferences` 的 `extensions.settings` 里只剩一条、`path` 指向第二个目录。要用 `Browser.close` 而不是直接杀进程，否则 prefs 可能来不及落盘。

### 消息机制

`wxt.config.ts` 设了 `extensionApi: 'chrome'`，**没有 webextension-polyfill**。因此 `onMessage` 监听器**不能返回 Promise**，必须 `sendResponse` + `return true`。所有操作统一返回 `OperResult`（`{ ok, error?, ... }`），失败信息要能在弹窗里显示出来，不能只靠系统通知 —— 用户可能关掉了通知。

### 存储平台（GitHub / Gitee）

`setting.ts` 的 `PROVIDERS` 表定义两个平台，`provider` 字段决定走哪个。两边各存一套凭据（`githubToken`/`gistID` 与 `giteeToken`/`giteeGistID`），`activeCredentials()` 取当前这套并 **`trim()` 掉首尾空白**（用户曾在片段 ID 框里只敲了一个空格，`" "` 是真值就被判成已配置；从地址栏复制 ID 也常带换行），`isConfigured()` 按当前平台判断；`gistFileName` 两平台共用。

**凭据格式校验**分三层，规则只定义一次在 `setting.ts`（`TOKEN_PATTERN` / `SNIPPET_ID_PATTERN`）：片段 ID 只许字母数字（两平台皆然）；令牌许字母、数字、下划线、连字符 —— **不能写成纯字母数字**，GitHub 的 `ghp_` / `github_pat_` 前缀含下划线，会把所有合法 GitHub 令牌挡掉。(1) 输入框原生 `pattern`：不匹配即 `:invalid`，红框 + `.invalid-hint`；`syncForm` 的 `_parseForm` 本来就跳过 `validity.valid === false` 的字段，所以坏值不会进 storage。(2) `isConfigured()` 也按格式判，老版本存下的坏值会落回引导页。(3) 后台 `requireGistConfig()` 再兜一层并给出说清原因的错误。另有一个表单级 `input` 监听在保存前 `trim()` 这四个字段的首尾空白 —— 只裁首尾不删中间，中间有空格该标红而不是悄悄拼成错值。

**`pattern` 属性里的连字符必须写成 `\-`**。Chromium 112 起 `pattern` 按正则 `v` 标志编译，`v` 模式下字符类里裸写的 `-`（以及 `(` `[` `{` `/` `|` 等）是语法错误；而**编译失败的 pattern 会被浏览器静默忽略**，字段永远合法、没有任何报错。这次就是令牌模式 `[A-Za-z0-9_-]` 被整个忽略、片段 ID 的 `[A-Za-z0-9]` 正常，只有实测才看得出来。改任何 pattern 后必须用 `el.validity.valid` 对一个明显错误的值验一遍。

两个平台的代码片段接口形状一致（路径、`files` 哈希、响应里的 `content`/`truncated`/`raw_url` 字段名都相同），差别只在 `http.ts` 的接入方式：GitHub 走 `Authorization` 头 + 自家 Accept 头；Gitee 走 `access_token` 查询参数，不认 GitHub 那套头。

以下几点都在真实 Gitee 片段上实测过（2026-10-09），不是推断：

- **PATCH 必须用 JSON 请求体**。文档把 `files` 标成 formData，但表单编码里传 JSON 字符串会被拒：`{"messages":["files is invalid"]}`。
- **Gitee 服务端拒收 emoji**：原文写入返回 400 `Mysql2::Error: Incorrect string value: '\xF0\x9F\x93\x9A...'` —— 存储用的是 3 字节 utf8，装不下 4 字节字符。`services.ts` 的 `escapeAstralChars` 在写入前把代理对改写成 `\uXXXX`，仍是合法 JSON，读回 `JSON.parse` 原样还原，标题里的 emoji 不会丢。中文是 BMP 字符不受影响、不转义，远端内容仍可读。只对 Gitee 做，GitHub 保持原文。
- 单文件 1 MB 写入/读回正常、不截断，书签数据量远够用。
- `files[name] = null` 可删除文件，与 GitHub 语义一致。
- 文档说 `description` 限 30 字符，但 PATCH 时并不强制；代码仍按 30 截断，无害。
- **Gitee 的页面地址有坑**（已逐个探测确认）：`gitee.com/personal_access_tokens/new` 是 404，正确的令牌页是 `gitee.com/profile/personal_access_tokens/new`（未登录时 307 跳登录页），且不支持预填参数；新建代码片段的真实地址是 `gitee.com/<用户名>/codes/new`，用户名拿不到所以无法通用（`gitee.com/codes/new` 404、`gitee.com/user/codes/new` 403），因此 `PROVIDERS.gitee.siteUrl` 指向代码片段列表页 `gitee.com/dashboard/codes`（未登录时 302 跳登录页，而 `/dashboard/` 下的无效路径是 404，可确认页面真实存在），具体操作写在 `snippetSteps` 里（右上角「+」→「发布代码片段」）。

设置页里**非活动平台的凭据组保留在 DOM 中但整体 `disabled`**。`syncForm` 保存时读取表单内所有非 disabled 字段并与已存值合并写回，所以 disabled 的那组不会被碰。不能改成一组输入框按平台换 `name`：切换瞬间输入框是空的，会以另一个平台的键名存成空串、把凭据抹掉。这一点已用 CDP 实测验证。

`webext-options-sync` 存储的两个细节，写测试直接读 storage 时会踩：配置经 lz-string `compressToEncodedURIComponent` 压缩成字符串存在 `storage.sync.options` 下；保存前剔除等于默认值的键，读取时再合并默认值。要拿完整对象走库的 `getAll()`，或自己解压后合并默认值。

### 对比逻辑

`DiffResult.identical` 取自**两棵树序列化后是否相等**，而不是「各分类是否为空」。因为同步是整树覆盖，序列化相等才真正等价于「同步是空操作」。

拍平成 `{路径, 标题, URL}` 会丢掉同级顺序，所以同一文件夹内拖动排序必须靠 `orderChanged` 分类单独识别（按文件夹报而非按条目报，避免插入一项就把后面全标成变化）。若序列化不相等但各分类都为空，置 `unexplainedDifference`，界面上明说存在无法归类的差异 —— 不能对用户谎称一致。

### 状态管理

- `curOperType`：同步期间置为非 `NONE`，避免自己写入的书签变动又触发角标
- 角标：`↻` 同步中、`✓` 已同步、`!` 本地有未同步改动、`✗` 出错
- 本地/远端书签数存在 `browser.storage.local`；弹窗里的本地数是实时算的，更准

### Gist 存储结构

```typescript
{
  version: string,
  createDate: number,
  browser: string,
  bookmarks: BookmarkInfo[]  // 归一化后的树
}
```

## 界面约定

- 弹窗是唯一主界面，分「同步」「设置」两个标签页，设置不再另开页面。`src/components/SettingsForm.tsx` 被弹窗标签页和独立设置页共用（后者保留是为了右键图标 →「选项」仍可用），样式在同目录的 `SettingsForm.css` 里，两边 import 同一份、不要复制规则
- **设置面板用 CSS 隐藏而非卸载**。`syncForm` 持有的是 DOM 表单引用，标签页切换若卸载组件会让它失去表单；用 `d-none` 保持挂载，隐藏的字段仍会被保存逻辑读到（这也是非活动平台凭据组必须 `disabled` 的原因）
- 弹窗固定 25rem（400px）宽。三个视图实测高度：同步 299px、设置 586px、对比 478px —— **Chrome 弹窗高度上限 600px**，新增内容时要留意别越过，否则会出现内部滚动条
- **没有 i18n**。`_locales/` 和 `default_locale` 已全部移除，中文直接写在代码里。新增文案直接写中文，不要重新引入 `browser.i18n.getMessage`
- 依赖停留在 Bootstrap 4 时代：`react-bootstrap@1` + `bootstrap@4`。用的是 v1 API（`InputGroup.Append`、`Badge variant`、`Button block`），不要混用 v2 写法
- 设置页表单由 `optionsStorage.syncForm()` 直接操作 DOM 完成读写，字段只需带正确的 `name`，**不需要** react-hook-form 之类的表单库
- **设置页里不能有 React 受控输入**（不要传 `value`/`checked`）。浏览器对 `<select>`、单选框先派发 `input` 再派发 `change`；`input` 阶段触发的任何重渲染都会把受控值写回旧状态，`change` 到达时已被改回去，表现为「选了又弹回」。让 syncForm 拥有 DOM 值，React 只通过 `onChange` 和 `browser.storage.onChanged` 镜像它，再用**只依赖该状态**的 effect 回写 DOM
- 保存反馈挂在库的 `options-sync:save-success` 事件上（冒泡到表单），不要用表单的 `onInput` —— 后者正好在上面那个危险窗口里触发重渲染
- 平台选择是**原生单选框**外面套卡片样式：`input[type=radio]` 透明隐藏但留在表单里，`syncForm` 才读得到（序列化库对 radio 的处理是 `KeyAssignmentValidators` 只接受 `checked` 的那个、读取走默认的 `el.value`）
- 破坏性操作（上传、下载、清空）必须先弹确认框并写明后果，执行期间要有加载动画。清空书签作为弱化的次要入口，不与上传下载同级
- 未完成配置时隐藏上传/下载/对比，只显示引导去「设置」标签页 —— 这些操作没有令牌和片段 ID 必然失败。**首次读取发现未配置会直接把初始标签页设为「设置」**，省掉一次点击；只在首次生效，用户之后手动切回「同步」或正在输入时不会被拽走
- 改完界面要实机验证渲染，类型检查和构建发现不了布局问题。本机装有 Chrome 155 和 Edge，用独立的临时 `--user-data-dir` 通过 CDP 加载 `.output/chrome-mv3` 截图，不要碰用户自己的 profile（`browser-cdp` 技能的启动脚本会杀掉用户正在运行的 Chrome 并复制其真实 profile，不要用）
- **CDP 模拟事件必须贴近真实**：按 `input` → `change` 顺序派发；且 React 对单选框/复选框的 `onChange` 实际绑定在 `click` 上，只派发 `change` 不会触发它。验证交互优先用 `Input.dispatchMouseEvent` 真实点击。多个同类元素（比如两个平台各有一个指引入口）要用「取可见的那个」而非 `querySelector`
- 弹窗页脚有「检查更新」，**纯手动点击**：拉 `api.github.com/repos/yc-2018/BookmarkHub/releases/latest`（现有 `*.github.com` host 权限已覆盖 api 子域，不用加权限；匿名每小时 60 次，手动点足够），与 `browser.runtime.getManifest().version` 比对，结果复用顶部提示条，有新版时附「去更新」链接到该版本的发行页。扩展是 zip + 加载已解压分发，浏览器不会替它自动更新，所以只能提示用户去下载覆盖安装；不要改成后台定时检查，理由同自动同步。页脚是同步/设置两个标签页共用的，放这里不会撑高 586px 的设置页

## 其他注意事项

- 上传前会剥掉所有浏览器私有字段（`dateAdded`、`id`、`index`、`parentId` 等）
- 平台侧要求：带 gist 权限的访问令牌、代码片段 ID、文件名（默认 `BookmarkHub`，两平台共用）
- 所需权限：`storage`、`bookmarks`、`notifications`，以及 GitHub 与 Gitee 的 host 权限
- 发行包不入库。`*.zip` 和 `releases/` 已加入 `.gitignore`，产物挂在 GitHub Release 上
- `wxt.config.ts` 的 `zip.excludeSources` 用于给 Firefox 审核的源码包减重 —— 默认会把仓库里的发行包一起打进去，导致逐版本复利累积
