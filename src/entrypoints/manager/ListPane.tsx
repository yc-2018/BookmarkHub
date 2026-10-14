import React, { useState } from 'react'
import { AiOutlineFolder, AiOutlineGlobal, AiOutlineMore } from 'react-icons/ai'
import { Node, SearchHit, label } from './tree'

/** 拖放落点：插到目标前/后，或者放进目标文件夹里 */
export type DropWhere = 'before' | 'after' | 'into'

/** 自定义 drag 类型：dragover 阶段读不到数据，但 types 能读，用来区分外部拖进来的东西 */
export const DRAG_TYPE = 'application/x-bh-node'

interface Props {
    /** 普通模式：当前文件夹的子项 */
    items?: Node[]
    /** 搜索模式：命中项 + 所在路径，这时不排序也不拖动 */
    hits?: SearchHit[]
    /** 这些行是不是最外层的根分类（根分类名是在线格式，不许改名/删除/拖动） */
    rootLevel: boolean
    onOpenFolder: (uid: number) => void
    onMenu: (node: Node, x: number, y: number) => void
    dragUid: number | null
    onDragStart: (uid: number) => void
    onDragEnd: () => void
    onMove: (dragUid: number, targetUid: number, where: DropWhere) => void
}

/** 跟着光标走的小胶囊，照 Chrome 的拖拽反馈做 */
function dragPill(text: string): HTMLElement {
    const pill = document.createElement('div')
    pill.className = 'mg-drag-pill'
    pill.textContent = text || '(无标题)'
    document.body.appendChild(pill)
    // Chrome 是同步截图的，下一拍移除不影响显示
    setTimeout(() => pill.remove(), 0)
    return pill
}

/** 右侧列表：一行一个书签或文件夹，可拖拽排序，操作在行尾 ⋮ 或右键菜单里 */
export const ListPane: React.FC<Props> = ({
    items, hits, rootLevel, onOpenFolder, onMenu, dragUid, onDragStart, onDragEnd, onMove,
}) => {
    const [over, setOver] = useState<{ uid: number, where: DropWhere } | null>(null)

    const rows: { node: Node, path?: string }[] = hits
        ? hits.map(h => ({ node: h.node, path: h.path }))
        : (items ?? []).map(node => ({ node }))

    if (rows.length === 0) {
        return (
            <div className="mg-list">
                <div className="mg-empty-folder">{hits ? '没有匹配的书签' : '这个文件夹是空的'}</div>
            </div>
        )
    }

    // 根分类不许拖；搜索结果是拍平的视图，拖动没有明确含义
    const canDrag = !rootLevel && !hits

    const zoneOf = (e: React.DragEvent, node: Node): DropWhere => {
        const r = e.currentTarget.getBoundingClientRect()
        const y = e.clientY - r.top
        if (node.url) {
            return y < r.height / 2 ? 'before' : 'after'
        }
        // 文件夹中间那段是「放进去」，上下两端才是插到前后
        return y < r.height * 0.3 ? 'before' : y > r.height * 0.7 ? 'after' : 'into'
    }

    const rowClass = (node: Node) => {
        const marks = ['mg-row']
        if (dragUid === node.uid) {
            marks.push('dragging')
        }
        if (over?.uid === node.uid) {
            marks.push('drop-' + over.where)
        }
        return marks.join(' ')
    }

    return (
        <div className="mg-list">
            {rows.map(({ node, path }) => (
                <div
                    className={rowClass(node)}
                    key={node.uid}
                    draggable={canDrag}
                    onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData(DRAG_TYPE, String(node.uid))
                        e.dataTransfer.setDragImage(dragPill(label(node, false)), 18, 18)
                        onDragStart(node.uid)
                    }}
                    onDragEnd={() => { setOver(null); onDragEnd() }}
                    onDragOver={e => {
                        // 用 dataTransfer 的类型判断「是不是我们自己的拖拽」，不看 React 状态：
                        // dragstart 引发的状态更新未必赶在第一次 dragover 之前落地
                        if (!canDrag || !e.dataTransfer.types.includes(DRAG_TYPE) || dragUid === node.uid) {
                            return
                        }
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const where = zoneOf(e, node)
                        setOver(prev => (prev?.uid === node.uid && prev.where === where ? prev : { uid: node.uid, where }))
                    }}
                    onDragLeave={() => setOver(prev => (prev?.uid === node.uid ? null : prev))}
                    onDrop={e => {
                        e.preventDefault()
                        const raw = e.dataTransfer.getData(DRAG_TYPE)
                        const from = Number(raw)
                        setOver(null)
                        if (raw && from !== node.uid) {
                            onMove(from, node.uid, zoneOf(e, node))
                        }
                    }}
                    onContextMenu={e => { e.preventDefault(); onMenu(node, e.clientX, e.clientY) }}
                >
                    {node.url
                        ? <AiOutlineGlobal className="mg-row-icon" />
                        : <AiOutlineFolder className="mg-row-icon" />}
                    <button
                        type="button"
                        className={node.url ? 'mg-row-open plain' : 'mg-row-open'}
                        onClick={() => { if (!node.url) onOpenFolder(node.uid) }}
                        onDoubleClick={() => { if (node.url) browser.tabs.create({ url: node.url }) }}
                        title={node.url ?? '打开文件夹'}
                    >
                        <div className="mg-row-title">{label(node, rootLevel && !hits) || '(无标题)'}</div>
                        {node.url && <div className="mg-row-url">{node.url}</div>}
                        {path && <div className="mg-row-path">{path}</div>}
                    </button>

                    <button
                        type="button"
                        className="mg-icon-btn mg-row-more"
                        title="更多操作（也可以直接右键）"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            onMenu(node, r.right - 4, r.bottom + 2)
                        }}
                    >
                        <AiOutlineMore />
                    </button>
                </div>
            ))}
        </div>
    )
}
