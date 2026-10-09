import { Setting, activeCredentials, providerId, providerInfo } from './setting'
import { createClient } from './http'

/**
 * 把 4 字节 UTF-8 字符（emoji 等 BMP 之外的字符）改写成 JSON 的 \uXXXX 转义。
 *
 * Gitee 后端会拒绝含 emoji 的内容（提示「代码中不能包含 Emoji 表情或其他特殊字符」），
 * 根因是 3 字节 utf8 存储装不下代理对。转义后内容只剩 ASCII 与 BMP 字符，
 * 但仍是合法 JSON，JSON.parse 读回时会原样还原，书签标题里的 emoji 不会丢。
 * 中文属于 BMP、3 字节，保持原文不转义，远端内容仍然可读。
 *
 * 只能作用在 JSON.stringify 的输出上：JSON 的结构字符全是 ASCII，
 * 代理对只会出现在字符串值内部，所以全局替换是安全的。
 */
export function escapeAstralChars(json: string): string {
    return json.replace(/[\uD800-\uDFFF]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

class BookmarkService {
    /** 读取远端代码片段里约定文件名的内容，不存在时返回 null */
    async get(): Promise<string | null> {
        const setting = await Setting.build()
        const { gistID } = activeCredentials(setting)
        const http = createClient(setting)

        const resp = await http.get(`gists/${gistID}`).json() as any
        if (resp?.files) {
            const filenames = Object.keys(resp.files)
            if (filenames.indexOf(setting.gistFileName) !== -1) {
                const gistFile = resp.files[setting.gistFileName]
                if (gistFile.truncated && gistFile.raw_url) {
                    // 内容过大时平台只给出 raw_url，要再取一次
                    return await http.get(gistFile.raw_url, { prefixUrl: '' }).text()
                }
                return gistFile.content
            }
        }
        return null
    }

    /** 写入远端代码片段 */
    async update(data: { files: Record<string, { content: string }>; description: string }) {
        const setting = await Setting.build()
        const { gistID } = activeCredentials(setting)
        const info = providerInfo(setting)
        const http = createClient(setting)

        let description = data.description
        if (info.descriptionMaxLength && description.length > info.descriptionMaxLength) {
            description = description.slice(0, info.descriptionMaxLength)
        }

        if (providerId(setting) === 'gitee') {
            // Gitee 不收 emoji，先把文件内容里的 4 字节字符转义掉
            const files: Record<string, { content: string }> = {}
            for (const [name, file] of Object.entries(data.files)) {
                files[name] = { content: escapeAstralChars(file.content) }
            }
            // 文档把参数标为 formData，但 files 是嵌套对象，用 JSON 请求体才能保住结构
            // （表单字段里的 JSON 字符串会被当成普通字符串）。access_token 已作为查询参数附在每个请求上。
            return http.patch(`gists/${gistID}`, { json: { files, description } }).json()
        }

        return http.patch(`gists/${gistID}`, { json: { ...data, description } }).json()
    }
}

export default new BookmarkService()
