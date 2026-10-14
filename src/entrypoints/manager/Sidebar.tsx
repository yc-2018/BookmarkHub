import React from 'react'
import { AiOutlineDown, AiOutlineFolder, AiOutlineRight, AiOutlineStar } from 'react-icons/ai'
import { Node, label } from './tree'
import { getBookmarkCount } from '../../utils/bookmarks'

interface Props {
    roots: Node[]
    /** null = 最外层「全部书签」 */
    selected: number | null
    onSelect: (uid: number | null) => void
    expanded: Set<number>
    onToggle: (uid: number) => void
}

/** 左侧目录树：只列文件夹，和 Chrome 书签管理器一样 */
export const Sidebar: React.FC<Props> = ({ roots, selected, onSelect, expanded, onToggle }) => {

    const rows = (list: Node[], depth: number): React.ReactNode[] =>
        list.filter(n => !n.url).flatMap(node => {
            const subFolders = (node.children ?? []).filter(c => !c.url)
            const open = expanded.has(node.uid)
            const row = (
                <button
                    key={node.uid}
                    type="button"
                    className={selected === node.uid ? 'mg-tree-row active' : 'mg-tree-row'}
                    style={{ paddingLeft: `${0.5 + depth * 1.15}rem` }}
                    onClick={() => onSelect(node.uid)}
                    title={label(node, depth === 0)}
                >
                    <span
                        className={subFolders.length > 0 ? 'mg-tree-caret' : 'mg-tree-caret hidden'}
                        onClick={e => { e.stopPropagation(); onToggle(node.uid) }}
                    >
                        {open ? <AiOutlineDown /> : <AiOutlineRight />}
                    </span>
                    <AiOutlineFolder className="mg-tree-folder" />
                    <span className="mg-tree-name">{label(node, depth === 0)}</span>
                    <span className="mg-tree-count">{getBookmarkCount(node.children)}</span>
                </button>
            )
            return open && subFolders.length > 0 ? [row, ...rows(node.children ?? [], depth + 1)] : [row]
        })

    return (
        <div className="mg-side">
            <button
                type="button"
                className={selected === null ? 'mg-tree-row active' : 'mg-tree-row'}
                onClick={() => onSelect(null)}
            >
                <span className="mg-tree-caret hidden"><AiOutlineRight /></span>
                <AiOutlineStar className="mg-tree-folder" />
                <span className="mg-tree-name">全部书签</span>
                <span className="mg-tree-count">{getBookmarkCount(roots)}</span>
            </button>
            {rows(roots, 0)}
        </div>
    )
}
