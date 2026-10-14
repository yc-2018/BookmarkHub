import React, { useEffect, useState } from 'react'
import {
    AiOutlineArrowDown, AiOutlineArrowUp, AiOutlineDelete, AiOutlineEdit,
    AiOutlineFolder, AiOutlineGlobal, AiOutlineMore
} from 'react-icons/ai'
import { Node, SearchHit, label } from './tree'

interface Props {
    /** 普通模式：当前文件夹的子项 */
    items?: Node[]
    /** 搜索模式：命中项 + 所在路径，这时不提供挪位置 */
    hits?: SearchHit[]
    /** 这些行是不是最外层的根分类（根分类名是在线格式，不许改名/删除/挪动） */
    rootLevel: boolean
    onOpenFolder: (uid: number) => void
    onEdit: (node: Node) => void
    onDelete: (node: Node) => void
    onMove: (uid: number, delta: number) => void
}

/** 右侧列表：一行一个书签或文件夹，操作放在行尾的 ⋮ 菜单里 */
export const ListPane: React.FC<Props> = ({ items, hits, rootLevel, onOpenFolder, onEdit, onDelete, onMove }) => {
    const [menu, setMenu] = useState<{ uid: number, up: boolean } | null>(null)

    useEffect(() => {
        if (!menu) {
            return
        }
        const close = () => setMenu(null)
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [menu])

    const rows: { node: Node, path?: string }[] = hits
        ? hits.map(h => ({ node: h.node, path: h.path }))
        : (items ?? []).map(node => ({ node }))

    if (rows.length === 0) {
        return (
            <div className="mg-list">
                <div className="mg-empty-folder">
                    {hits ? '没有匹配的书签' : '这个文件夹是空的'}
                </div>
            </div>
        )
    }

    const locked = rootLevel && !hits

    return (
        <div className="mg-list">
            {rows.map(({ node, path }, i) => (
                <div className="mg-row" key={node.uid}>
                    {node.url
                        ? <AiOutlineGlobal className="mg-row-icon" />
                        : <AiOutlineFolder className="mg-row-icon" />}
                    <button
                        type="button"
                        className={node.url ? 'mg-row-open plain' : 'mg-row-open'}
                        onClick={() => { if (!node.url) onOpenFolder(node.uid) }}
                        title={node.url ?? '打开文件夹'}
                    >
                        <div className="mg-row-title">{label(node, rootLevel && !hits) || '(无标题)'}</div>
                        {node.url && <div className="mg-row-url">{node.url}</div>}
                        {path && <div className="mg-row-path">{path}</div>}
                    </button>

                    <div className="mg-row-tools">
                        {!locked && !hits && (
                            <>
                                <button type="button" className="mg-icon-btn" title="上移"
                                    disabled={i === 0} onClick={() => onMove(node.uid, -1)}>
                                    <AiOutlineArrowUp />
                                </button>
                                <button type="button" className="mg-icon-btn" title="下移"
                                    disabled={i === rows.length - 1} onClick={() => onMove(node.uid, 1)}>
                                    <AiOutlineArrowDown />
                                </button>
                            </>
                        )}
                        <div className="mg-menu-wrap">
                            <button
                                type="button"
                                className="mg-icon-btn"
                                title="更多操作"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => setMenu(m => m?.uid === node.uid
                                    ? null
                                    : { uid: node.uid, up: e.clientY > window.innerHeight / 2 })}
                            >
                                <AiOutlineMore />
                            </button>
                            {menu?.uid === node.uid && (
                                <div className={menu.up ? 'mg-menu up' : 'mg-menu'} onMouseDown={e => e.stopPropagation()}>
                                    {node.url && (
                                        <button type="button" onClick={() => { setMenu(null); window.open(node.url, '_blank', 'noreferrer') }}>
                                            <AiOutlineGlobal />在新标签页打开
                                        </button>
                                    )}
                                    <button type="button" disabled={locked}
                                        title={locked ? '根分类的名称是同步格式的一部分，不能改' : undefined}
                                        onClick={() => { setMenu(null); onEdit(node) }}>
                                        <AiOutlineEdit />编辑
                                    </button>
                                    <button type="button" className={locked ? undefined : 'mg-menu-danger'} disabled={locked}
                                        title={locked ? '根分类不能删除' : undefined}
                                        onClick={() => { setMenu(null); onDelete(node) }}>
                                        <AiOutlineDelete />删除
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
