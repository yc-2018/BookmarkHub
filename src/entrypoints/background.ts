import BookmarkService from '../utils/services'
import { HTTPError } from 'ky'
import { Setting, activeCredentials, providerInfo } from '../utils/setting'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType, BrowserType } from '../utils/models'
import { detectBrowserType, formatBookmarks, getBookmarkCount } from '../utils/bookmarks'
import { diffBookmarks } from '../utils/diff'
import { OperResult } from '../utils/messages'
import { Bookmarks } from 'wxt/browser'

export default defineBackground(() => {

  let curOperType = OperType.NONE
  let curBrowserType = BrowserType.CHROME

  // 角标状态
  const ICON_SYNCED = "✓"
  const ICON_NOT_SYNCED = "!"
  const ICON_SYNCING = "↻"
  const ICON_ERROR = "✗"

  /** Chrome MV3 是 action，Firefox MV2 只有 browserAction */
  const actionApi: any = (browser as any).action ?? (browser as any).browserAction

  browser.runtime.onInstalled.addListener(() => {
    // 清理旧版本自动同步留下的存储键
    browser.storage.local.remove('lastRemoteUpdateTime')
    refreshLocalCount()
  })

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg)
      .then(sendResponse)
      .catch(async (e: any) => sendResponse({ ok: false, error: await describeError(e) }))
    return true
  })

  async function handleMessage(msg: any): Promise<OperResult> {
    switch (msg?.name) {
      case 'upload':
        return runExclusive(OperType.SYNC, uploadBookmarks)
      case 'download':
        return runExclusive(OperType.SYNC, () => downloadBookmarks(msg.remoteBookmarks))
      case 'removeAll':
        return runExclusive(OperType.REMOVE, removeAllBookmarks)
      case 'compare':
        return compareBookmarks()
      case 'setting':
        await browser.runtime.openOptionsPage()
        return { ok: true }
      default:
        return { ok: false, error: `未知操作：${msg?.name ?? ''}` }
    }
  }

  /**
   * 执行一个会写书签的操作：期间把 curOperType 置为非 NONE，
   * 避免我们自己写入的书签变更又触发「本地有未同步改动」角标。
   */
  async function runExclusive(operType: OperType, fn: () => Promise<OperResult>): Promise<OperResult> {
    curOperType = operType
    setBadge(ICON_SYNCING, "#0D6EFD")
    try {
      const result = await fn()
      setBadge(result.ok ? ICON_SYNCED : ICON_ERROR, result.ok ? "#00AA00" : "#FF0000")
      return result
    } finally {
      curOperType = OperType.NONE
      await refreshLocalCount()
    }
  }

  browser.bookmarks.onCreated.addListener(() => markLocalChanged(true))
  browser.bookmarks.onChanged.addListener(() => markLocalChanged(false))
  browser.bookmarks.onMoved.addListener(() => markLocalChanged(false))
  browser.bookmarks.onRemoved.addListener(() => markLocalChanged(true))

  function markLocalChanged(countChanged: boolean) {
    if (curOperType !== OperType.NONE) {
      return
    }
    setBadge(ICON_NOT_SYNCED, "#FFA500")
    if (countChanged) {
      refreshLocalCount()
    }
  }

  function setBadge(text: string, color: string) {
    // 角标只是提示，任何失败都不该影响同步本身
    try {
      actionApi?.setBadgeText({ text })
      actionApi?.setBadgeBackgroundColor({ color })
    } catch (e) {
      console.warn('设置角标失败', e)
    }
  }

  function errorText(e: any): string {
    return String(e?.message ?? e ?? '未知错误')
  }

  /** HTTP 错误时附上服务端返回的 message，令牌错误、ID 不存在这类问题才看得出原因 */
  async function describeError(e: any): Promise<string> {
    if (e instanceof HTTPError) {
      let detail = ''
      try {
        const j: any = await e.response.clone().json()
        detail = j?.message ?? (Array.isArray(j?.messages) ? j.messages.join('；') : '')
      } catch { }
      return `HTTP ${e.response.status}${detail ? '：' + detail : ''}`
    }
    return errorText(e)
  }

  /** 校验当前所选平台的配置，缺项时抛出中文错误 */
  async function requireGistConfig() {
    const setting = await Setting.build()
    const info = providerInfo(setting)
    const { token, gistID } = activeCredentials(setting)
    if (!token) {
      throw new Error(`未配置 ${info.name} Token`)
    }
    if (!gistID) {
      throw new Error(`未配置 ${info.name} 代码片段 ID`)
    }
    if (!setting.gistFileName) {
      throw new Error("未配置文件名")
    }
    return setting
  }

  async function notify(title: string, message: string) {
    const setting = await Setting.build()
    if (!setting.enableNotify) {
      return
    }
    await browser.notifications.create({
      type: "basic",
      iconUrl: iconLogo,
      title,
      message
    })
  }

  async function uploadBookmarks(): Promise<OperResult> {
    try {
      const setting = await requireGistConfig()
      const bookmarks = await getBookmarks()
      const syncdata = new SyncDataInfo()
      syncdata.version = browser.runtime.getManifest().version
      syncdata.createDate = Date.now()
      syncdata.bookmarks = formatBookmarks(bookmarks)
      syncdata.browser = navigator.userAgent
      await BookmarkService.update({
        files: {
          [setting.gistFileName]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: setting.gistFileName
      })
      const count = getBookmarkCount(syncdata.bookmarks)
      await browser.storage.local.set({ remoteCount: count })
      return { ok: true, remoteCount: count, localCount: count }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("上传书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  /**
   * 下载远端书签覆盖本地。
   * 传入 remoteBookmarks 时直接使用（对比功能已经拉过一次，不再重复请求）。
   */
  async function downloadBookmarks(remoteBookmarks?: BookmarkInfo[]): Promise<OperResult> {
    try {
      let bookmarks = remoteBookmarks
      if (!bookmarks) {
        const setting = await requireGistConfig()
        const gist = await BookmarkService.get()
        if (!gist) {
          throw new Error(`远端未找到文件 ${setting.gistFileName}`)
        }
        const syncdata: SyncDataInfo = JSON.parse(gist)
        if (!syncdata.bookmarks || syncdata.bookmarks.length === 0) {
          throw new Error(`远端文件 ${setting.gistFileName} 内容为空`)
        }
        bookmarks = syncdata.bookmarks
      }

      await getBookmarks()   // 刷新 curBrowserType，建树时需要
      await clearBookmarkTree()
      await createBookmarkTree(bookmarks)
      const count = getBookmarkCount(bookmarks)
      await browser.storage.local.set({ remoteCount: count })
      return { ok: true, remoteCount: count, localCount: count }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("下载书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  async function removeAllBookmarks(): Promise<OperResult> {
    try {
      await getBookmarks()
      await clearBookmarkTree()
      return { ok: true, localCount: 0 }
    }
    catch (error: any) {
      console.error(error)
      const reason = await describeError(error)
      await notify("清空本地书签", `错误：${reason}`)
      return { ok: false, error: reason }
    }
  }

  /** 拉取远端书签并与本地比对，不改动任何数据 */
  async function compareBookmarks(): Promise<OperResult> {
    try {
      const setting = await requireGistConfig()
      const gist = await BookmarkService.get()
      if (!gist) {
        throw new Error(`远端未找到文件 ${setting.gistFileName}`)
      }
      const syncdata: SyncDataInfo = JSON.parse(gist)
      const localBookmarks = formatBookmarks(await getBookmarks())
      const diff = diffBookmarks(localBookmarks, syncdata.bookmarks, {
        createDate: syncdata.createDate,
        browser: syncdata.browser,
        version: syncdata.version,
      })
      await browser.storage.local.set({ remoteCount: diff.remoteCount })
      return { ok: true, diff, remoteBookmarks: syncdata.bookmarks }
    }
    catch (error: any) {
      console.error(error)
      return { ok: false, error: await describeError(error) }
    }
  }

  async function getBookmarks(): Promise<BookmarkInfo[]> {
    const bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree()
    curBrowserType = detectBrowserType(bookmarkTree)
    return bookmarkTree
  }

  /** 清空本地书签。失败会向上抛，避免清空没成功还继续建树导致书签翻倍。 */
  async function clearBookmarkTree() {
    const bookmarks = await browser.bookmarks.getTree()
    const tempNodes: BookmarkInfo[] = []
    bookmarks[0].children?.forEach(c => {
      c.children?.forEach(d => {
        tempNodes.push(d)
      })
    })
    for (const node of tempNodes) {
      if (node.id) {
        await browser.bookmarks.removeTree(node.id)
      }
    }
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined) {
    if (bookmarkList == null) {
      return
    }
    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i]
      if (node.title == RootBookmarksType.MenuFolder
        || node.title == RootBookmarksType.MobileFolder
        || node.title == RootBookmarksType.ToolbarFolder
        || node.title == RootBookmarksType.UnfiledFolder) {
        if (curBrowserType == BrowserType.FIREFOX) {
          switch (node.title) {
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => c.parentId = "menu________");
              break;
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => c.parentId = "mobile______");
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => c.parentId = "toolbar_____");
              break;
            case RootBookmarksType.UnfiledFolder:
              node.children?.forEach(c => c.parentId = "unfiled_____");
              break;
            default:
              node.children?.forEach(c => c.parentId = "unfiled_____");
              break;
          }
        } else {
          switch (node.title) {
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => c.parentId = "3");
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => c.parentId = "1");
              break;
            case RootBookmarksType.UnfiledFolder:
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => c.parentId = "2");
              break;
            default:
              node.children?.forEach(c => c.parentId = "2");
              break;
          }
        }
        await createBookmarkTree(node.children);
        continue;
      }

      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        /* 处理firefox中创建 chrome://chrome-urls/ 格式的书签会报错的问题 */
        res = await browser.bookmarks.create({
          parentId: node.parentId,
          title: node.title,
          url: node.url
        });
      } catch (err) {
        console.error(res, err);
      }
      if (res.id && node.children && node.children.length > 0) {
        node.children.forEach(c => c.parentId = res.id);
        await createBookmarkTree(node.children);
      }
    }
  }

  async function refreshLocalCount() {
    const bookmarkList = await browser.bookmarks.getTree()
    const count = getBookmarkCount(bookmarkList)
    await browser.storage.local.set({ localCount: count })
  }

})
