import { BookmarkInfo, BrowserType, RootBookmarksType } from './models'

/** 根目录文件夹的中文展示名。注意：枚举值本身是已存 gist 的在线格式，不能改。 */
export const ROOT_FOLDER_LABELS: Record<string, string> = {
    [RootBookmarksType.ToolbarFolder]: '书签栏',
    [RootBookmarksType.UnfiledFolder]: '其他书签',
    [RootBookmarksType.MobileFolder]: '移动设备书签',
    [RootBookmarksType.MenuFolder]: '书签菜单',
}

/** 把根目录的内部标识名换成中文展示名，其余标题原样返回 */
export function displayFolderName(title: string): string {
    return ROOT_FOLDER_LABELS[title] ?? title
}

/** 统计书签数量（只数带 url 的叶子节点，不数文件夹） */
export function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined): number {
    let count = 0
    if (bookmarkList) {
        bookmarkList.forEach(c => {
            if (c.url) {
                count = count + 1
            }
            else {
                count = count + getBookmarkCount(c.children)
            }
        })
    }
    return count
}

/** 根据书签树根节点 id 判断浏览器类型 */
export function detectBrowserType(bookmarkTree: BookmarkInfo[]): BrowserType {
    if (bookmarkTree && bookmarkTree[0]?.id === 'root________') {
        return BrowserType.FIREFOX
    }
    return BrowserType.CHROME
}

/**
 * 把本地书签树归一化成可上传 / 可比对的格式：
 * 根目录文件夹改成统一标识名，节点只留下同步真正承载的字段。
 * 不修改入参（内部先深拷贝）。
 */
export function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    const root = structuredClone(bookmarks[0])
    if (root?.children) {
        for (let a of root.children) {
            switch (a.id) {
                case '1':
                case 'toolbar_____':
                    a.title = RootBookmarksType.ToolbarFolder
                    break
                case 'menu________':
                    a.title = RootBookmarksType.MenuFolder
                    break
                case '2':
                case 'unfiled_____':
                    a.title = RootBookmarksType.UnfiledFolder
                    break
                case '3':
                case 'mobile______':
                    a.title = RootBookmarksType.MobileFolder
                    break
            }
        }
    }
    return stripMetadata(root).children
}

/**
 * 同步格式只承载这三个字段，其余全是浏览器私有信息，写进 gist 会让
 * 「同一份书签」在不同浏览器/版本下序列化结果不同，对比时变成无法归类的假差异。
 * 用白名单而不是逐个列举黑名单：Chrome 155 会额外挂上 syncing、folderType，
 * 将来还可能再加字段，列举法必然漏。
 */
const SYNC_FIELDS = ['title', 'url', 'children']

function stripMetadata(b: BookmarkInfo): BookmarkInfo {
    for (const key of Object.keys(b)) {
        if (!SYNC_FIELDS.includes(key)) {
            delete (b as any)[key]
        }
    }
    if (b.children && b.children.length > 0) {
        b.children.forEach(c => stripMetadata(c))
    }
    return b
}
