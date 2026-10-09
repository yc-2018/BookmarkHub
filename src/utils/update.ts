/**
 * 检查更新：拉 GitHub Releases 的最新版本号，与当前安装版本比对。
 *
 * 扩展以 zip + 加载已解压的方式分发，浏览器不会替它自动更新，所以这里只能
 * 告诉用户有新版并给出发行页，由用户下载后覆盖安装。纯手动触发：MV3 的
 * service worker 空闲即终止、项目也没申请 alarms 权限，不要改成后台定时查。
 */

/** 发行页。仓库沿用旧名 BookmarkHub，改名时不要动这个地址 */
export const RELEASES_PAGE = 'https://github.com/yc-2018/BookmarkHub/releases'
/** releases/latest 只返回正式版，不含预发布和草稿 */
const LATEST_API = 'https://api.github.com/repos/yc-2018/BookmarkHub/releases/latest'

export interface UpdateInfo {
    /** 当前安装的版本，即 manifest.version */
    current: string
    /** 远端最新发行版本，已去掉 tag 的 v 前缀 */
    latest: string
    hasUpdate: boolean
    /** 该版本的发行页，用户到这里下载 */
    releaseUrl: string
}

/** 按点分段做数值比较；a 比 b 新返回正数，相同返回 0 */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(s => parseInt(s, 10) || 0)
    const pb = b.split('.').map(s => parseInt(s, 10) || 0)
    const n = Math.max(pa.length, pb.length)
    for (let i = 0; i < n; i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d !== 0) return d
    }
    return 0
}

export async function checkForUpdate(): Promise<UpdateInfo> {
    const current = browser.runtime.getManifest().version
    let res: Response
    try {
        // 匿名调用每小时 60 次，手动点击远用不完；host_permissions 的 *.github.com 已覆盖 api 子域
        res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } })
    } catch {
        throw new Error('网络请求失败，请检查能否访问 GitHub')
    }
    if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`)
    const data = await res.json() as { tag_name?: string; html_url?: string }
    const latest = String(data.tag_name ?? '').replace(/^v/i, '')
    if (!latest) throw new Error('没有读到版本号')
    return {
        current,
        latest,
        hasUpdate: compareVersions(latest, current) > 0,
        releaseUrl: data.html_url || RELEASES_PAGE,
    }
}
