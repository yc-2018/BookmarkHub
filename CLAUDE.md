# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指引。

## 项目概述

BookmarkHub 是一个跨浏览器扩展，以 GitHub Gist 作为存储，在 Chrome、Firefox、Edge 之间同步书签。技术栈为 WXT + React + TypeScript。

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

- 消息分发：`upload` / `download` / `removeAll` / `compare` / `setting`
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
| `services.ts` | `BookmarkService`，封装 GitHub Gist API |
| `http.ts` | ky 客户端，自动注入 GitHub 认证头 |
| `setting.ts` | `Setting.build()` 读取配置 |
| `optionsStorage.ts` | webext-options-sync 的默认值定义 |
| `models.ts` | `BookmarkInfo`、`SyncDataInfo` 及各枚举 |

弹窗与后台共用 `bookmarks.ts` / `diff.ts`，所以这些函数**不能依赖后台特有的运行环境**。

## 关键技术细节

### 浏览器差异

- Firefox 根节点 ID 为 `"root________"`，Chrome 为数字 `"0"`/`"1"`/`"2"`/`"3"`
- 归一化时统一换成 `RootBookmarksType` 的标识名（`ToolbarFolder` 等），下载时再按目标浏览器映射回去
- **`RootBookmarksType` 的枚举值是已存 Gist 的在线格式，改了会破坏兼容性，只能在展示层映射成中文**
- Firefox 构建为 MV2，`browser.action` 不存在（MV2 是 `browser_action`）。后台用 `browser.action ?? browser.browserAction` 回退，新增角标相关代码必须沿用

### 消息机制

`wxt.config.ts` 设了 `extensionApi: 'chrome'`，**没有 webextension-polyfill**。因此 `onMessage` 监听器**不能返回 Promise**，必须 `sendResponse` + `return true`。所有操作统一返回 `OperResult`（`{ ok, error?, ... }`），失败信息要能在弹窗里显示出来，不能只靠系统通知 —— 用户可能关掉了通知。

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

- **没有 i18n**。`_locales/` 和 `default_locale` 已全部移除，中文直接写在代码里。新增文案直接写中文，不要重新引入 `browser.i18n.getMessage`
- 依赖停留在 Bootstrap 4 时代：`react-bootstrap@1` + `bootstrap@4`。用的是 v1 API（`InputGroup.Append`、`Badge variant`、`Button block`），不要混用 v2 写法
- 设置页表单由 `optionsStorage.syncForm()` 直接操作 DOM 完成读写，字段只需带正确的 `name`，**不需要** react-hook-form 之类的表单库
- 破坏性操作（上传、下载、清空）必须先弹确认框并写明后果，执行期间要有加载动画
- 未完成配置时隐藏上传/下载/对比，只显示引导去设置 —— 这些操作没有 token 和 gist id 必然失败
- 弹窗默认 17rem 宽，对比面板靠 `body.wide` 切到 26rem
- 改完界面要实机验证渲染，类型检查和构建发现不了布局问题。本机没有 Chrome，用 Edge 加独立临时配置通过 CDP 加载 `.output/chrome-mv3` 截图

## 其他注意事项

- 上传前会剥掉所有浏览器私有字段（`dateAdded`、`id`、`index`、`parentId` 等）
- GitHub 侧要求：带 `gist` 权限的 Token、Gist ID、文件名（默认 `BookmarkHub`）
- 所需权限：`storage`、`bookmarks`、`notifications`，以及 GitHub 的 host 权限
- 发行包不入库。`*.zip` 和 `releases/` 已加入 `.gitignore`，产物挂在 GitHub Release 上
- `wxt.config.ts` 的 `zip.excludeSources` 用于给 Firefox 审核的源码包减重 —— 默认会把仓库里的发行包一起打进去，导致逐版本复利累积
