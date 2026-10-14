import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
    AiOutlineCopy, AiOutlineDelete, AiOutlineEdit, AiOutlineExport,
    AiOutlineGlobal, AiOutlineScissor, AiOutlineSnippets
} from 'react-icons/ai'
import { Node, collectUrls } from './tree'

export type MenuAction = 'edit' | 'delete' | 'cut' | 'copy' | 'paste' | 'open' | 'openWindow' | 'openAll'

export interface MenuSpec {
    x: number
    y: number
    node: Node
    /** 根分类：标识名是在线格式的一部分，不许改名、删除或剪走 */
    locked: boolean
}

interface Props {
    spec: MenuSpec
    canPaste: boolean
    onAction: (a: MenuAction) => void
    onClose: () => void
}

/**
 * 行尾 ⋮ 与右键共用的一个菜单，照 Chrome 书签管理器的分组来排。
 * 固定定位而不是挂在行里：行在可滚动容器里，绝对定位会被裁掉。
 */
export const ContextMenu: React.FC<Props> = ({ spec, canPaste, onAction, onClose }) => {
    const box = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ left: spec.x, top: spec.y })

    // 贴着视口边缘时翻个面，别把菜单露到外头去
    useLayoutEffect(() => {
        const el = box.current
        if (!el) {
            return
        }
        const { width, height } = el.getBoundingClientRect()
        const left = spec.x + width > window.innerWidth - 8 ? Math.max(8, spec.x - width) : spec.x
        const top = spec.y + height > window.innerHeight - 8 ? Math.max(8, spec.y - height) : spec.y
        setPos({ left, top })
    }, [spec.x, spec.y, spec.node.uid])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('mousedown', onClose)
        document.addEventListener('keydown', onKey)
        window.addEventListener('resize', onClose)
        return () => {
            document.removeEventListener('mousedown', onClose)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', onClose)
        }
    }, [onClose])

    const { node, locked } = spec
    const isFolder = !node.url
    const urlCount = isFolder ? collectUrls(node).length : 0

    const item = (a: MenuAction, icon: React.ReactNode, text: string, opts?: { disabled?: boolean, why?: string, danger?: boolean }) => (
        <button
            type="button"
            disabled={opts?.disabled}
            title={opts?.disabled ? opts?.why : undefined}
            className={opts?.danger && !opts?.disabled ? 'mg-menu-danger' : undefined}
            onClick={() => { onClose(); onAction(a) }}
        >
            {icon}{text}
        </button>
    )

    return (
        <div
            ref={box}
            className="mg-menu mg-menu-fixed"
            style={{ left: pos.left, top: pos.top }}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            {item('edit', <AiOutlineEdit />, isFolder ? '重命名' : '修改(E)',
                { disabled: locked, why: '根分类的名称是同步格式的一部分，不能改' })}
            {item('delete', <AiOutlineDelete />, '删除(D)',
                { disabled: locked, why: '根分类不能删除', danger: true })}

            <div className="mg-menu-sep" />
            {item('cut', <AiOutlineScissor />, '剪切',
                { disabled: locked, why: '根分类不能剪切' })}
            {item('copy', <AiOutlineCopy />, '复制')}
            {item('paste', <AiOutlineSnippets />, '粘贴',
                { disabled: !canPaste, why: '剪贴板里没有东西' })}

            <div className="mg-menu-sep" />
            {isFolder
                ? item('openAll', <AiOutlineExport />, `打开全部（${urlCount} 个）网址`,
                    { disabled: urlCount === 0, why: '这个文件夹里没有网址' })
                : (
                    <>
                        {item('open', <AiOutlineGlobal />, '在新标签页中打开')}
                        {item('openWindow', <AiOutlineExport />, '在新窗口中打开')}
                    </>
                )}
        </div>
    )
}
