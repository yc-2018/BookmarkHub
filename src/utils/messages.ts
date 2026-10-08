import { BookmarkInfo } from './models'
import { DiffResult } from './diff'

export type OperName = 'upload' | 'download' | 'removeAll' | 'compare' | 'setting'

/** popup 与 background 之间的统一应答格式 */
export interface OperResult {
    ok: boolean
    error?: string
    localCount?: number
    remoteCount?: number
    diff?: DiffResult
    /** compare 时顺带回传的远端书签树，供随后的「下载覆盖本地」复用，避免二次请求 */
    remoteBookmarks?: BookmarkInfo[]
}

export interface OperMessage {
    name: OperName
    /** download 专用：直接用这份数据建树，跳过 Gist 请求 */
    remoteBookmarks?: BookmarkInfo[]
}

/** 向 background 发起一次操作 */
export async function sendOper(msg: OperMessage): Promise<OperResult> {
    try {
        const res = await browser.runtime.sendMessage(msg)
        return (res as OperResult) ?? { ok: false, error: '后台无响应' }
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e ?? '后台无响应') }
    }
}
