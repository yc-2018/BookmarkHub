import { BookmarkInfo, SyncDataInfo } from './models'

/**
 * 书签文件（导出 / 导入 / 预览页共用的那种 JSON）的读写。
 *
 * 文件内容与上传到代码片段的完全一致：顶层是 SyncDataInfo，`bookmarks` 是归一化后的树
 * （根分类用 RootBookmarksType 的标识名，节点只有 title/url/children）。所以三条路径
 * ——导出成文件、在预览页里改、再导入回浏览器——用的是同一种数据，互相都能接。
 */

/** 解析出来的文件内容；元信息缺失不算错，老文件和手写的裸数组都要能读 */
export interface ParsedBookmarkFile {
    bookmarks: BookmarkInfo[]
    version?: string
    browser?: string
    createDate?: number
}

/** 同步格式只承载这三个字段，与 bookmarks.ts 的 SYNC_FIELDS 一致 */
function sanitize(nodes: unknown): BookmarkInfo[] {
    if (!Array.isArray(nodes)) {
        return []
    }
    const out: BookmarkInfo[] = []
    for (const raw of nodes) {
        if (!raw || typeof raw !== 'object') {
            continue
        }
        const node = raw as Record<string, unknown>
        const title = typeof node.title === 'string' ? node.title : ''
        const url = typeof node.url === 'string' ? node.url : undefined
        const children = node.children === undefined ? undefined : sanitize(node.children)
        // 既没有 url 也没有 children 的节点当文件夹处理，不丢掉（可能是空文件夹）
        const item: BookmarkInfo = { title }
        if (url) {
            item.url = url
        } else {
            item.children = children ?? []
        }
        out.push(item)
    }
    return out
}

/**
 * 读一份导出的书签文件。
 * 接受两种形状：完整的 SyncDataInfo，或者只有一个书签数组（手工裁剪过的文件）。
 * 格式不对时抛出说得清原因的中文错误 —— 用户选错文件是最常见的情况。
 */
export function parseBookmarkFile(text: string): ParsedBookmarkFile {
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        throw new Error('不是有效的 JSON 文件，请选择本扩展导出的 .json 文件')
    }
    if (Array.isArray(data)) {
        const bookmarks = sanitize(data)
        if (bookmarks.length === 0) {
            throw new Error('文件里没有书签数据')
        }
        return { bookmarks }
    }
    if (!data || typeof data !== 'object') {
        throw new Error('文件内容不是书签数据')
    }
    const obj = data as Record<string, unknown>
    if (!Array.isArray(obj.bookmarks)) {
        throw new Error('文件里缺少 bookmarks 字段，可能不是本扩展导出的文件')
    }
    const bookmarks = sanitize(obj.bookmarks)
    if (bookmarks.length === 0) {
        throw new Error('文件里没有书签数据')
    }
    return {
        bookmarks,
        version: typeof obj.version === 'string' ? obj.version : undefined,
        browser: typeof obj.browser === 'string' ? obj.browser : undefined,
        createDate: typeof obj.createDate === 'number' ? obj.createDate : undefined,
    }
}

/** 包成和上传一致的 SyncDataInfo */
export function buildSyncData(bookmarks: BookmarkInfo[] | undefined, version: string): SyncDataInfo {
    const data = new SyncDataInfo()
    data.version = version
    data.createDate = Date.now()
    data.browser = navigator.userAgent
    data.bookmarks = bookmarks
    return data
}

/** 导出文件名用的本地时间戳 yyyyMMdd-HHmmss */
export function fileStamp(d: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 触发一次 JSON 文件下载 */
export function downloadJson(fileName: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    // Firefox 要求节点在文档里，click() 才会真的触发下载
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 弹窗一关 blob 就失效，等下载接手之后再回收
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 让用户挑一个文件并读成文本；取消时返回 null */
export function pickJsonFile(): Promise<{ name: string, text: string } | null> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.style.display = 'none'
        // 取消选择不会派发任何事件（cancel 事件较新且弹窗里不可靠），
        // 所以不 resolve 也无妨：调用方只在真的选了文件之后才继续。
        input.onchange = () => {
            const file = input.files?.[0]
            input.remove()
            if (!file) {
                resolve(null)
                return
            }
            const reader = new FileReader()
            reader.onload = () => resolve({ name: file.name, text: String(reader.result ?? '') })
            reader.onerror = () => reject(new Error('读取文件失败'))
            reader.readAsText(file)
        }
        document.body.appendChild(input)
        input.click()
    })
}
