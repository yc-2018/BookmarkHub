import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'

/** 存储平台。值会原样存进 storage，不要随意改字面量。 */
export type ProviderId = 'github' | 'gitee'

export const PROVIDERS: Record<ProviderId, {
    name: string
    apiBase: string
    /** 代码片段所在站点（Gitee 指向代码片段列表页，新建页带用户名无法通用） */
    siteUrl: string
    /** 指引里「打开 …」按钮用的站点名，与 name 可能不同（GitHub -> GitHub Gist） */
    siteName: string
    /** 申请令牌的页面 */
    tokenUrl: string
    /** 令牌需要的权限范围名 */
    tokenScope: string
    /** 获取代码片段 ID 的步骤说明 */
    snippetSteps: string[]
    /** description 字段的长度上限，超出会被平台拒绝；undefined 表示无限制 */
    descriptionMaxLength?: number
}> = {
    github: {
        name: 'GitHub',
        apiBase: 'https://api.github.com',
        /** 指引里「打开 …」按钮的文案与目标，GitHub 用 Gist 子站而非主站 */
        siteName: 'GitHub Gist',
        siteUrl: 'https://gist.github.com/',
        tokenUrl: 'https://github.com/settings/tokens/new?scopes=gist&description=BookmarkHub',
        tokenScope: 'gist',
        snippetSteps: [
            '打开 GitHub Gist，新建一个 Secret gist',
            '「Filename including extension」填下面的「文件名」字段（默认 BookmarkHub）',
            '代码内容区随便敲一个字符，不能留空',
            '创建后复制地址栏最后一段，即为代码片段 ID',
        ],
    },
    gitee: {
        name: 'Gitee 码云',
        apiBase: 'https://gitee.com/api/v5',
        // /dashboard/codes 是代码片段列表页（未登录 302 跳登录页）；新建页
        // gitee.com/<用户名>/codes/new 带用户名，没法通用，所以指向列表页
        siteUrl: 'https://gitee.com/dashboard/codes',
        siteName: 'Gitee',
        tokenUrl: 'https://gitee.com/profile/personal_access_tokens/new',
        tokenScope: 'gists',
        snippetSteps: [
            '登录 Gitee 后，鼠标移到右上角的「+」号',
            '点击弹出菜单里的「发布代码片段」',
            '各字段随意填，其中「代码片段」一栏建议填 BookmarkHub，与下面的「文件名」保持一致',
            '发布后复制地址栏最后一段，即为代码片段 ID',
        ],
        // Gitee 文档标明 description 限 1~30 个字符
        descriptionMaxLength: 30,
    },
}

/** 平台顺序：设置页的单选卡与「同时上传」的遍历都用这一份 */
export const PROVIDER_IDS: ProviderId[] = ['github', 'gitee']

export class SettingBase implements Options {
    constructor() { }
    [key: string]: string | number | boolean;
    provider: string = 'github';
    githubToken: string = '';
    gistID: string = '';
    giteeToken: string = '';
    giteeGistID: string = '';
    gistFileName: string = 'BookmarkHub';
    enableNotify: boolean = true;
    /** 上传时同时写入两个平台（只在两边都配置齐全时生效，下载与对比仍只用所选平台） */
    uploadBoth: boolean = false;
    githubURL: string = 'https://api.github.com';
}

export class Setting extends SettingBase {
    private constructor() { super() }
    static async build() {
        let options = await optionsStorage.getAll();
        let setting = new Setting();
        setting.provider = options.provider;
        setting.gistID = options.gistID;
        setting.giteeToken = options.giteeToken;
        setting.giteeGistID = options.giteeGistID;
        setting.gistFileName = options.gistFileName;
        setting.githubToken = options.githubToken;
        setting.enableNotify = options.enableNotify;
        setting.uploadBoth = options.uploadBoth;
        return setting;
    }
}

export function providerId(setting: SettingBase): ProviderId {
    return setting.provider === 'gitee' ? 'gitee' : 'github'
}

export function providerInfo(setting: SettingBase) {
    return PROVIDERS[providerId(setting)]
}

/**
 * 取出指定平台的那组凭据。
 * 统一去掉首尾空白：从地址栏复制片段 ID 常带换行或空格，不处理的话
 * "  " 会被当成已填写、API 请求也会因 ID 不匹配而 404。
 */
export function credentialsFor(setting: SettingBase, id: ProviderId): { token: string; gistID: string } {
    const raw = id === 'gitee'
        ? { token: setting.giteeToken, gistID: setting.giteeGistID }
        : { token: setting.githubToken, gistID: setting.gistID }
    return { token: String(raw.token ?? '').trim(), gistID: String(raw.gistID ?? '').trim() }
}

/** 取出当前所选平台（下载与对比的数据来源）的那组凭据 */
export function activeCredentials(setting: SettingBase): { token: string; gistID: string } {
    return credentialsFor(setting, providerId(setting))
}

/**
 * 凭据格式。ID 两个平台都只含字母数字（GitHub 是 32 位十六进制，Gitee 是小写字母数字）；
 * 令牌要放行下划线和连字符 —— GitHub 的 ghp_ / github_pat_ 前缀就含下划线，
 * 写成纯字母数字会把所有合法 GitHub 令牌挡在外面。
 * 这两条同时用在输入框的 pattern 属性、isConfigured 和后台的 requireGistConfig。
 *
 * 连字符必须写成 \- ：浏览器把 pattern 属性按正则 v 标志编译，v 模式下字符类里裸写的 -
 * 是语法错误，而编译失败的 pattern 会被浏览器静默忽略（字段永远合法），不会有任何报错。
 */
export const TOKEN_PATTERN = '[A-Za-z0-9_\\-]+'
export const SNIPPET_ID_PATTERN = '[A-Za-z0-9]+'
const TOKEN_RE = new RegExp('^' + TOKEN_PATTERN + '$')
const SNIPPET_ID_RE = new RegExp('^' + SNIPPET_ID_PATTERN + '$')

export const isValidToken = (s: string) => TOKEN_RE.test(s)
export const isValidSnippetId = (s: string) => SNIPPET_ID_RE.test(s)

/** 指定平台是否已配置齐全且格式正确 */
export function isConfiguredFor(setting: SettingBase, id: ProviderId): boolean {
    const { token, gistID } = credentialsFor(setting, id)
    return isValidToken(token) && isValidSnippetId(gistID) && !!setting.gistFileName
}

/** 当前所选平台是否已配置齐全且格式正确 */
export function isConfigured(setting: SettingBase): boolean {
    return isConfiguredFor(setting, providerId(setting))
}

/** 两个平台都配置齐全了 —— 「同时上传」开关只有这时才有意义 */
export function bothConfigured(setting: SettingBase): boolean {
    return PROVIDER_IDS.every(id => isConfiguredFor(setting, id))
}

/**
 * 本次上传要写入哪些平台。
 * 开了「同时上传」且两边都配置齐全时写两个，所选平台排在前面 —— 它是下载与对比的
 * 来源，先把它写完，另一个平台慢或超时都不会推迟它。否则只写所选平台。
 * 另一个平台没配好就当开关没开：设置里的开关这时是灰的，用户看得到原因。
 */
export function uploadTargets(setting: SettingBase): ProviderId[] {
    const active = providerId(setting)
    if (!setting.uploadBoth || !bothConfigured(setting)) {
        return [active]
    }
    return [active, ...PROVIDER_IDS.filter(id => id !== active)]
}
