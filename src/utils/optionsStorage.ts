import OptionsSync from 'webext-options-sync';
/* global OptionsSync */

export default new OptionsSync({
    defaults: {
        // 'github' | 'gitee'，决定下面用哪一组凭据
        provider: 'github',
        githubToken: '',
        gistID: '',
        giteeToken: '',
        giteeGistID: '',
        // 文件名两个平台共用
        gistFileName: 'BookmarkHub',
        enableNotify: true,
        githubURL: 'https://api.github.com',
    },

    // List of functions that are called when the extension is updated
    migrations: [
        (savedOptions, currentDefaults) => {
            // Perhaps it was renamed
            // if (savedOptions.colour) {
            //     savedOptions.color = savedOptions.colour;
            //delete savedOptions.colour;
            // }
        },

        // Integrated utility that drops any properties that don't appear in the defaults
        OptionsSync.migrations.removeUnused
    ],
    logging: false
});