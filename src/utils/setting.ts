import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'

/** 存储平台。值会原样存进 storage，不要随意改字面量。 */
export type ProviderId = 'github' | 'gitee'

export const PROVIDERS: Record<ProviderId, {
    name: string
    apiBase: string
    /** 新建代码片段的页面 */
    newGistUrl: string
    /** 申请令牌的页面 */
    tokenUrl: string
    /** description 字段的长度上限，超出会被平台拒绝；undefined 表示无限制 */
    descriptionMaxLength?: number
}> = {
    github: {
        name: 'GitHub',
        apiBase: 'https://api.github.com',
        newGistUrl: 'https://gist.github.com/',
        tokenUrl: 'https://github.com/settings/tokens/new?scopes=gist&description=BookmarkHub',
    },
    gitee: {
        name: 'Gitee',
        apiBase: 'https://gitee.com/api/v5',
        newGistUrl: 'https://gitee.com/codes',
        tokenUrl: 'https://gitee.com/personal_access_tokens/new',
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
