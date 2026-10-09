import { BookmarkInfo } from './models'
import { displayFolderName, getBookmarkCount } from './bookmarks'

/** 展平后的一条书签 / 文件夹 */
export interface FlatEntry {
    /** 所属文件夹链，' / ' 连接，根层已换成中文标签 */
    path: string
    title: string
    /** 文件夹为 undefined */
    url?: string
}

export interface MovedEntry {
    title: string
    url: string
    /** 远端所在路径 */
    fromPath: string
    /** 本地所在路径 */
    toPath: string
}

export interface TitleChangedEntry {
    path: string
    url: string
    localTitle: string
    remoteTitle: string
}

export interface RemoteMeta {
    createDate: number
    browser: string
    version: string
}

/** 某个文件夹内「成员相同但先后顺序不同」 */
export interface OrderChangedEntry {
    /** 发生顺序变化的文件夹路径，空串表示根目录 */
    path: string
    /** 该文件夹内的条目数 */
    count: number
}

export interface DiffResult {
    /** 两棵树的同步内容（标题 / URL / 子节点）完全一致 —— 也就是同步属于空操作 */
    identical: boolean
    localCount: number
    remoteCount: number
    /** 仅本地有：上传后远端会新增，下载后本地会丢失 */
    localOnly: FlatEntry[]
    /** 仅远端有：下载后本地会新增，上传后远端会丢失 */
    remoteOnly: FlatEntry[]
    /** 同一个 URL 换了文件夹 */
    moved: MovedEntry[]
    /** 同路径同 URL，标题不同 */
    titleChanged: TitleChangedEntry[]
    /** 文件夹内成员没变，但排列顺序变了 */
    orderChanged: OrderChangedEntry[]
    folderLocalOnly: FlatEntry[]
    folderRemoteOnly: FlatEntry[]
    /**
     * 同步内容不一致，但上面所有分类都是空的。
     * 说明存在对比逻辑没覆盖到的差异，不能对用户谎称「一致」。
     */
    unexplainedDifference: boolean
    remoteMeta?: RemoteMeta
}

const SEP = '\u0000'

/** 递归展平归一化后的书签树，分别收集书签和文件夹 */
export function flattenBookmarks(nodes: BookmarkInfo[] | undefined): { bookmarks: FlatEntry[]; folders: FlatEntry[] } {
    const bookmarks: FlatEntry[] = []
    const folders: FlatEntry[] = []

    const walk = (list: BookmarkInfo[] | undefined, segments: string[]) => {
        if (!list) return
        const path = segments.join(' / ')
        for (const node of list) {
            if (node.url) {
                bookmarks.push({ path, title: node.title ?? '', url: node.url })
            } else {
                const label = displayFolderName(node.title ?? '')
                folders.push({ path, title: label })
                walk(node.children, [...segments, label])
            }
        }
    }

    walk(nodes, [])
    return { bookmarks, folders }
}

function groupBy(entries: FlatEntry[], keyOf: (e: FlatEntry) => string): Map<string, FlatEntry[]> {
    const map = new Map<string, FlatEntry[]>()
    for (const entry of entries) {
        const key = keyOf(entry)
        const bucket = map.get(key)
        if (bucket) {
            bucket.push(entry)
        } else {
            map.set(key, [entry])
        }
    }
    return map
}

/**
 * 按键分组后比对两侧数量，返回各自多出来的条目。
 * 用数组而非单值，才能正确处理同一文件夹内重复的 URL。
 * onPaired 用于检查配对上的条目之间还有什么差异（比如标题）。
 */
function surplus(
    localEntries: FlatEntry[],
    remoteEntries: FlatEntry[],
    keyOf: (e: FlatEntry) => string,
    onPaired?: (local: FlatEntry, remote: FlatEntry) => void,
): { localSurplus: FlatEntry[]; remoteSurplus: FlatEntry[] } {
    const localMap = groupBy(localEntries, keyOf)
    const remoteMap = groupBy(remoteEntries, keyOf)
    const localSurplus: FlatEntry[] = []
    const remoteSurplus: FlatEntry[] = []

    for (const key of new Set([...localMap.keys(), ...remoteMap.keys()])) {
        const L = localMap.get(key) ?? []
        const R = remoteMap.get(key) ?? []
        const paired = Math.min(L.length, R.length)
        if (onPaired) {
            for (let i = 0; i < paired; i++) {
                onPaired(L[i], R[i])
            }
        }
        if (L.length > paired) localSurplus.push(...L.slice(paired))
        if (R.length > paired) remoteSurplus.push(...R.slice(paired))
    }

    return { localSurplus, remoteSurplus }
}

/** 从两份盈余里把 URL 相同的配对识别为「位置变化」，返回剩余的真正增删 */
function extractMoved(
    localSurplus: FlatEntry[],
    remoteSurplus: FlatEntry[],
): { moved: MovedEntry[]; localOnly: FlatEntry[]; remoteOnly: FlatEntry[] } {
    const moved: MovedEntry[] = []
    const remoteByUrl = groupBy(remoteSurplus, e => e.url ?? '')
    const consumed = new Set<FlatEntry>()
    const localOnly: FlatEntry[] = []

    for (const local of localSurplus) {
        const candidates = remoteByUrl.get(local.url ?? '')
        const match = candidates?.find(c => !consumed.has(c))
        if (match) {
            consumed.add(match)
            moved.push({
                title: local.title,
                url: local.url ?? '',
                fromPath: match.path,
                toPath: local.path,
            })
        } else {
            localOnly.push(local)
        }
    }

    return { moved, localOnly, remoteOnly: remoteSurplus.filter(r => !consumed.has(r)) }
}

/**
 * 收集每个文件夹内子项的「有序签名列表」。
 * 拍平后的 FlatEntry 丢掉了同级顺序，而上传时序列化的正是数组顺序，
 * 所以同一文件夹内拖动排序必须靠这份数据才能发现。
 */
function collectOrder(nodes: BookmarkInfo[] | undefined): Map<string, string[]> {
    const order = new Map<string, string[]>()

    const walk = (list: BookmarkInfo[] | undefined, segments: string[]) => {
        if (!list) return
        const path = segments.join(' / ')
        const sig: string[] = []
        for (const node of list) {
            if (node.url) {
                sig.push('b|' + node.url)
            } else {
                const label = displayFolderName(node.title ?? '')
                sig.push('f|' + label)
                walk(node.children, [...segments, label])
            }
        }
        order.set(path, sig)
    }

    walk(nodes, [])
    return order
}

/** 成员相同、顺序不同的文件夹。成员本身有增删时交由其他分类说明，这里跳过以免重复报。 */
function diffOrder(
    local: Map<string, string[]>,
    remote: Map<string, string[]>,
): OrderChangedEntry[] {
    const changed: OrderChangedEntry[] = []
    for (const [path, l] of local) {
        const r = remote.get(path)
        if (!r) continue
        if (l.join('\n') === r.join('\n')) continue
        if ([...l].sort().join('\n') !== [...r].sort().join('\n')) continue
        changed.push({ path, count: l.length })
    }
    return changed
}

/**
 * 把一棵树收敛成「同步内容」：只保留 title / url / children，同级顺序不变。
 * 远端是历史版本写下的原文，可能残留浏览器私有字段（syncing、folderType 等），
 * 空文件夹的 children 也可能写成 [] 或整个缺席 —— 这些都是同一棵树的不同写法，
 * 抹平后比较才不会得出「有差异但一类都归不出」的假提示。
 */
function canonicalize(nodes: BookmarkInfo[] | undefined): unknown[] {
    return (nodes ?? []).map(n => {
        const out: { title: string; url?: string; children?: unknown[] } = { title: n.title ?? '' }
        if (n.url) {
            out.url = n.url
        }
        if (n.children && n.children.length > 0) {
            out.children = canonicalize(n.children)
        }
        return out
    })
}

/** 比对本地与远端两棵归一化书签树 */
export function diffBookmarks(
    localNodes: BookmarkInfo[] | undefined,
    remoteNodes: BookmarkInfo[] | undefined,
    remoteMeta?: RemoteMeta,
): DiffResult {
    const local = flattenBookmarks(localNodes)
    const remote = flattenBookmarks(remoteNodes)

    const titleChanged: TitleChangedEntry[] = []
    const bookmarkSurplus = surplus(
        local.bookmarks,
        remote.bookmarks,
        e => e.path + SEP + e.url,
        (l, r) => {
            if (l.title !== r.title) {
                titleChanged.push({
                    path: l.path,
                    url: l.url ?? '',
                    localTitle: l.title,
                    remoteTitle: r.title,
                })
            }
        },
    )

    const { moved, localOnly, remoteOnly } = extractMoved(
        bookmarkSurplus.localSurplus,
        bookmarkSurplus.remoteSurplus,
    )

    const folderSurplus = surplus(local.folders, remote.folders, e => e.path + SEP + e.title)
    const orderChanged = diffOrder(collectOrder(localNodes), collectOrder(remoteNodes))

    // 同步是整树覆盖，所以「是否需要同步」的真实判据是两棵树的同步内容是否相等，
    // 而不是上面那些分类是否为空。浏览器私有字段不参与比较 ——
    // 下载时它们由浏览器自己生成、无法按远端还原，拿它们当判据会永远报「有差异」。
    const identical = JSON.stringify(canonicalize(localNodes)) === JSON.stringify(canonicalize(remoteNodes))

    const classified =
        localOnly.length + remoteOnly.length + moved.length + titleChanged.length +
        orderChanged.length + folderSurplus.localSurplus.length + folderSurplus.remoteSurplus.length

    return {
        identical,
        localCount: getBookmarkCount(localNodes),
        remoteCount: getBookmarkCount(remoteNodes),
        localOnly,
        remoteOnly,
        moved,
        titleChanged,
        orderChanged,
        folderLocalOnly: folderSurplus.localSurplus,
        folderRemoteOnly: folderSurplus.remoteSurplus,
        unexplainedDifference: !identical && classified === 0,
        remoteMeta,
    }
}
