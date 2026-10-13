import ky, { KyInstance } from 'ky'
import { SettingBase, ProviderId, credentialsFor, providerId, PROVIDERS } from './setting'

/**
 * 按平台创建 HTTP 客户端。不传 target 时用设置里所选的平台
 * （「同时上传」要写另一个平台，就把它的 id 传进来）。
 *
 * 两边的 gist 接口形状一致（路径、files 哈希结构、响应字段名都相同），
 * 差别只在接入方式：
 *   - GitHub：Authorization 头 + 自家的 Accept / API 版本头
 *   - Gitee：access_token 查询参数，且不认 GitHub 那套头
 */
export function createClient(setting: SettingBase, target?: ProviderId): KyInstance {
    const id = target ?? providerId(setting)
    const { token } = credentialsFor(setting, id)
    const base = PROVIDERS[id].apiBase

    if (id === 'gitee') {
        return ky.create({
            prefixUrl: base,
            timeout: 60000,
            retry: 1,
            // Gitee 走查询参数认证，设成默认项后每个请求都会带上
            searchParams: { access_token: token },
        })
    }

    return ky.create({
        prefixUrl: base,
        timeout: 60000,
        retry: 1,
        hooks: {
            beforeRequest: [
                request => {
                    request.headers.set('Authorization', `Bearer ${token}`)
                    request.headers.set('Content-Type', `application/json;charset=utf-8`)
                    request.headers.set('X-GitHub-Api-Version', `2022-11-28`)
                    request.headers.set('Accept', `application/vnd.github+json`)
                    request.headers.set('cache', 'no-store')
                }
            ]
        }
    })
}
