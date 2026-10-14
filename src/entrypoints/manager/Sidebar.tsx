import React, { useState } from 'react'
import { AiOutlineDown, AiOutlineFolder, AiOutlineRight, AiOutlineStar } from 'react-icons/ai'
import { Node, contains, label } from './tree'
import { DRAG_TYPE } from './ListPane'
import { getBookmarkCount } from '../../utils/bookmarks'

interface Props {
    roots: Node[]
    /** null = 最外层「全部书签」 */
    selected: number | null
    onSelect: (uid: number | null) => void
    expanded: Set<number>
    onToggle: (uid: number) => void
    onMenu: (node: Node, x: number, y: number) => void
    /** 正在拖的节点，用来判断能不能往这个文件夹里放 */
    dragNode: Node | null
    onMove: (dragUid: number, targetUid: number) => void
}

/** 左侧目录树：只列文件夹，和 Chrome 书签管理器一样。也是跨文件夹拖放的落点 */
export const Sidebar: React.FC<Props> = ({
    roots, selected, onSelect, expanded, onToggle, onMenu, dragNode, onMove,
}) => {
    const [over, setOver] = useState<number | null>(null)

    // dragNode 只用来决定要不要给高亮：不能把文件夹拖进自己或自己的子孙里。
    // 真正的拦截在 manager 的 moveNode 里（它拿得到整棵树），所以 drop 不依赖这个状态
    const canDrop = (uid: number) => !dragNode || !contains(dragNode, uid)

    const rows = (list: Node[], depth: number): React.ReactNode[] =>
        list.filter(n => !n.url).flatMap(node => {
            const subFolders = (node.children ?? []).filter(c => !c.url)
            const open = expanded.has(node.uid)
            const marks = ['mg-tree-row']
            if (selected === node.uid) {
                marks.push('active')
            }
            if (over === node.uid) {
                marks.push('drop-into')
            }
            const row = (
                <button
                    key={node.uid}
                    type="button"
                    className={marks.join(' ')}
                    style={{ paddingLeft: `${0.5 + depth * 1.15}rem` }}
                    onClick={() => onSelect(node.uid)}
                    onContextMenu={e => { e.preventDefault(); onMenu(node, e.clientX, e.clientY) }}
                    onDragOver={e => {
                        if (!e.dataTransfer.types.includes(DRAG_TYPE) || !canDrop(node.uid)) {
                            return
                        }
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setOver(node.uid)
                    }}
                    onDragLeave={() => setOver(prev => (prev === node.uid ? null : prev))}
                    onDrop={e => {
                        e.preventDefault()
                        setOver(null)
                        const raw = e.dataTransfer.getData(DRAG_TYPE)
                        if (raw) {
                            onMove(Number(raw), node.uid)
                        }
                    }}
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
                title="最外层：只有几个根分类，书签放不进来"
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
