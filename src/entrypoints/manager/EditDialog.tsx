import React, { useState } from 'react'

export type DialogSpec =
    | { mode: 'edit', uid: number, title: string, url?: string }
    | { mode: 'newFolder' }
    | { mode: 'newBookmark' }

const TITLES: Record<DialogSpec['mode'], string> = {
    edit: '编辑',
    newFolder: '新建文件夹',
    newBookmark: '新建书签',
}

interface Props {
    spec: DialogSpec
    onCancel: () => void
    onSubmit: (title: string, url?: string) => void
}

/** 改名 / 新建用的小对话框。网址字段只对书签出现（文件夹没有 url） */
export const EditDialog: React.FC<Props> = ({ spec, onCancel, onSubmit }) => {
    const isBookmark = spec.mode === 'newBookmark' || (spec.mode === 'edit' && spec.url !== undefined)
    const [title, setTitle] = useState(spec.mode === 'edit' ? spec.title : '')
    const [url, setUrl] = useState(spec.mode === 'edit' ? (spec.url ?? '') : '')

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        const name = title.trim()
        const addr = url.trim()
        if (isBookmark && !addr) {
            return
        }
        if (!isBookmark && !name) {
            return
        }
        onSubmit(name || addr, isBookmark ? addr : undefined)
    }

    return (
        <div className="mg-mask" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
            <form className="mg-dialog" onSubmit={submit}>
                <h2>{TITLES[spec.mode]}</h2>
                <div className="mg-field">
                    <label htmlFor="mg-title">名称</label>
                    <input id="mg-title" value={title} autoFocus onChange={e => setTitle(e.target.value)}
                        placeholder={isBookmark ? '留空就用网址当名称' : '文件夹名称'} />
                </div>
                {isBookmark && (
                    <div className="mg-field">
                        <label htmlFor="mg-url">网址</label>
                        <input id="mg-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
                    </div>
                )}
                <div className="mg-dialog-foot">
                    <button type="button" className="mg-btn" onClick={onCancel}>取消</button>
                    <button type="submit" className="mg-btn mg-btn-primary">保存</button>
                </div>
            </form>
        </div>
    )
}
