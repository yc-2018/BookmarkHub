import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'

/** 存储平台。值会原样存进 storage，不要随意改字面量。 */
export type ProviderId = 'github' | 'gitee'

export const PROVIDERS: Record<ProviderId, {
    name: string
    apiBase: string
    /** 代码片段所在站点（Gitee 的新建页带用户名，无法通用，只能给站点首页） */
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
        // gitee.com/codes/new 是 404，gitee.com/<用户名>/codes/new 才是真实地址，
        // 但用户名拿不到，没法通用，所以只给站点首页，具体步骤见 snippetSteps
        siteUrl: 'https://gitee.com',
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
        return setting;
    }
}

export function providerId(setting: SettingBase): ProviderId {
    return setting.provider === 'gitee' ? 'gitee' : 'github'
}

export function providerInfo(setting: SettingBase) {
    return PROVIDERS[providerId(setting)]
}

/** 取出当前所选平台对应的那组凭据 */
export function activeCredentials(setting: SettingBase): { token: string; gistID: string } {
    return providerId(setting) === 'gitee'
        ? { token: setting.giteeToken, gistID: setting.giteeGistID }
        : { token: setting.githubToken, gistID: setting.gistID }
}

/** 当前所选平台是否已配置齐全 */
export function isConfigured(setting: SettingBase): boolean {
    const { token, gistID } = activeCredentials(setting)
    return !!(token && gistID && setting.gistFileName)
}
