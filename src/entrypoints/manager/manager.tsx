import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
    AiOutlineCheckCircle, AiOutlineExclamationCircle, AiOutlineExport, AiOutlineFolderAdd,
    AiOutlineImport, AiOutlineInbox, AiOutlineMore, AiOutlinePlus, AiOutlineSearch,
    AiOutlineSortAscending, AiOutlineStar
} from 'react-icons/ai'
import './manager.css'
import { getBookmarkCount } from '../../utils/bookmarks'
import { buildSyncData, downloadJson, fileStamp, parseBookmarkFile, pickJsonFile } from '../../utils/bookmarkFile'
import { Node, label, locate, nextUid, pathTo, search, sortByName, toNodes, toPlain } from './tree'
import { Sidebar } from './Sidebar'
import { ListPane } from './ListPane'
import { DialogSpec, EditDialog } from './EditDialog'

const VERSION = browser.runtime.getManifest().version

/**
 * 书签预览页：把「导出的 JSON 文件」当书签库来看和改，布局照着 Chrome 书签管理器。
 * 全程只操作文件内容，不读也不写浏览器真实书签 —— 改完点导出，再回弹窗用
 * 「导入本地书签」写回去，所以覆盖本地这一步始终由用户在弹窗里确认。
 */
const Manager: React.FC = () => {
    // null = 还没导入任何文件，这时整页只有一个超大的导入入口
    const [roots, setRoots] = useState<Node[] | null>(null)
    const [fileName, setFileName] = useState('')
    const [dirty, setDirty] = useState(false)
    // null 表示选中最外层「全部书签」，这时右侧列出的是各个根分类
    const [selected, setSelected] = useState<number | null>(null)
    const [expanded, setExpanded] = useState<Set<number>>(new Set())
    const [query, setQuery] = useState('')
    const [dialog, setDialog] = useState<DialogSpec | null>(null)
    const [topMenu, setTopMenu] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const [toast, setToast] = useState<{ ok: boolean, text: string } | null>(null)

    const say = useCallback((ok: boolean, text: string) => {
        setToast({ ok, text })
        setTimeout(() => setToast(t => (t && t.text === text ? null : t)), 3500)
    }, [])

    // 改了还没导出就离开，等于白改一场
    useEffect(() => {
        if (!dirty) {
            return
        }
        const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
        window.addEventListener('beforeunload', onLeave)
        return () => window.removeEventListener('beforeunload', onLeave)
    }, [dirty])

    useEffect(() => {
        if (!topMenu) {
            return
        }
        const close = () => setTopMenu(false)
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [topMenu])

    const load = useCallback((name: string, text: string) => {
        try {
            const parsed = parseBookmarkFile(text)
            const tree = toNodes(parsed.bookmarks, true)
            setRoots(tree)
            setFileName(name)
            setSelected(null)
            setExpanded(new Set(tree.map(n => n.uid)))
            setDirty(false)
            setQuery('')
            say(true, `已载入 ${name}，共 ${getBookmarkCount(tree)} 个书签`)
        } catch (e) {
            say(false, e instanceof Error ? e.message : String(e))
        }
    }, [say])

    const runImport = useCallback(async () => {
        if (dirty && !window.confirm('当前修改还没导出，导入新文件会丢掉这些修改。确定继续？')) {
            return
        }
        try {
            const picked = await pickJsonFile()
            if (picked) {
                load(picked.name, picked.text)
            }
        } catch (e) {
            say(false, e instanceof Error ? e.message : String(e))
        }
    }, [dirty, load, say])

    const runExport = useCallback(() => {
        if (!roots) {
            return
        }
        try {
            const data = buildSyncData(toPlain(roots), VERSION)
            downloadJson(`BookmarkHub-edited-${fileStamp()}.json`, JSON.stringify(data, null, 2))
            setDirty(false)
            say(true, `已导出 ${getBookmarkCount(roots)} 个书签，可在弹窗里用「导入本地书签」写回浏览器`)
        } catch (e) {
            say(false, '导出失败：' + (e instanceof Error ? e.message : String(e)))
        }
    }, [roots, say])

    /** 所有修改都走这里：改的是深拷贝，顺手把「有未导出修改」点亮 */
    const mutate = useCallback((fn: (draft: Node[]) => void) => {
        setRoots(prev => {
            if (!prev) {
                return prev
            }
            const draft = structuredClone(prev)
            fn(draft)
            return draft
        })
        setDirty(true)
    }, [])

    const dropFile = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (!file) {
            return
        }
        const reader = new FileReader()
        reader.onload = () => load(file.name, String(reader.result ?? ''))
        reader.onerror = () => say(false, '读取文件失败')
        reader.readAsText(file)
    }

    // ---------- 空状态：整页只剩一个超大导入入口 ----------
    if (!roots) {
        return (
            <div className="mg-app">
                <div className="mg-head">
                    <span className="mg-brand">
                        <AiOutlineStar />书签预览
                        <span className="mg-brand-sub">只看 / 改导出的文件，不碰浏览器书签</span>
                    </span>
                </div>
                <div className="mg-blank">
                    <div
                        className={dragOver ? 'mg-drop over' : 'mg-drop'}
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={dropFile}
                    >
                        <AiOutlineInbox className="mg-drop-mark" />
                        <div className="mg-blank-title">还没有书签</div>
                        <div className="mg-blank-text">
                            先在扩展弹窗里点「导出本地书签」，存下 <code>BookmarkHub-*.json</code>，<br />
                            再把它导进来：在这里整理完导出，用「导入本地书签」写回浏览器。
                        </div>
                        <button type="button" className="mg-import-big" onClick={runImport}>
                            <AiOutlineImport />导入书签文件
                        </button>
                        <div className="mg-blank-hint">也可以把 .json 文件直接拖到这个框里</div>
                    </div>
                </div>
                {toastView(toast)}
            </div>
        )
    }

    // ---------- 已载入 ----------
    const q = query.trim().toLowerCase()
    const hits = q ? search(roots, q) : undefined
    const crumbs = selected === null ? [] : pathTo(roots, selected)
    const folder = selected === null ? null : locate(roots, selected)?.node ?? null
    const items = selected === null ? roots : folder?.children ?? []
    const rootLevel = selected === null

    const openFolder = (uid: number) => {
        setSelected(uid)
        setExpanded(prev => new Set(prev).add(uid))
        setQuery('')
    }

    const del = (node: Node) => {
        const count = getBookmarkCount(node.children)
        const what = node.url ? `书签「${node.title || node.url}」` : `文件夹「${node.title}」及其中 ${count} 个书签`
        if (!window.confirm(`删除${what}？\n\n只改这份文件，浏览器书签不受影响。`)) {
            return
        }
        mutate(draft => {
            const found = locate(draft, node.uid)
            if (found) {
                found.siblings.splice(found.index, 1)
            }
        })
    }

    const move = (uid: number, delta: number) => mutate(draft => {
        const found = locate(draft, uid)
        if (!found) {
            return
        }
        const to = found.index + delta
        if (to < 0 || to >= found.siblings.length) {
            return
        }
        const [it] = found.siblings.splice(found.index, 1)
        found.siblings.splice(to, 0, it)
    })

    const applyDialog = (title: string, url?: string) => {
        if (!dialog) {
            return
        }
        if (dialog.mode === 'edit') {
            mutate(draft => {
                const found = locate(draft, dialog.uid)
                if (found) {
                    found.node.title = title
                    if (found.node.url !== undefined && url) {
                        found.node.url = url
                    }
                }
            })
        } else {
            const fresh: Node = dialog.mode === 'newFolder'
                ? { uid: nextUid(), title, children: [] }
                : { uid: nextUid(), title, url }
            mutate(draft => {
                const into = selected === null ? draft : locate(draft, selected)?.node.children
                into?.push(fresh)
            })
        }
        setDialog(null)
    }

    const sortCurrent = () => mutate(draft => {
        const list = selected === null ? draft : locate(draft, selected)?.node.children
        if (list) {
            sortByName(list)
        }
    })

    return (
        <div className="mg-app">
            <div className="mg-head">
                <span className="mg-brand">
                    <AiOutlineStar />书签预览
                    <span className="mg-brand-sub" title={'来源文件：' + fileName}>
                        {fileName}｜{getBookmarkCount(roots)} 个书签
                    </span>
                </span>

                <div className="mg-search">
                    <AiOutlineSearch />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索书签" />
                </div>

                <div className="mg-head-right">
                    {/* 改过之后才出现：这是把修改带走的唯一出口，做得显眼些 */}
                    {dirty && (
                        <>
                            <span className="mg-dirty-note">有未导出的修改</span>
                            <button type="button" className="mg-export" onClick={runExport}
                                title="把改好的书签存成 JSON 文件">
                                <span className="mg-export-dot" /><AiOutlineExport />导出书签
                            </button>
                        </>
                    )}
                    <div className="mg-menu-wrap">
                        <button type="button" className="mg-icon-btn" title="更多操作"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setTopMenu(v => !v)}>
                            <AiOutlineMore />
                        </button>
                        {topMenu && (
                            <div className="mg-menu" onMouseDown={e => e.stopPropagation()}>
                                <button type="button" disabled={items.length < 2}
                                    onClick={() => { setTopMenu(false); sortCurrent() }}>
                                    <AiOutlineSortAscending />按名称排序
                                </button>
                                <button type="button" disabled={rootLevel}
                                    title={rootLevel ? '先在左侧选一个分类' : undefined}
                                    onClick={() => { setTopMenu(false); setDialog({ mode: 'newBookmark' }) }}>
                                    <AiOutlinePlus />添加新书签
                                </button>
                                <button type="button" disabled={rootLevel}
                                    title={rootLevel ? '先在左侧选一个分类' : undefined}
                                    onClick={() => { setTopMenu(false); setDialog({ mode: 'newFolder' }) }}>
                                    <AiOutlineFolderAdd />添加新文件夹
                                </button>
                                <div className="mg-menu-sep" />
                                <button type="button" onClick={() => { setTopMenu(false); runImport() }}>
                                    <AiOutlineImport />导入书签
                                </button>
                                <button type="button" onClick={() => { setTopMenu(false); runExport() }}>
                                    <AiOutlineExport />导出书签
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mg-body">
                <Sidebar
                    roots={roots}
                    selected={selected}
                    onSelect={uid => { setSelected(uid); setQuery('') }}
                    expanded={expanded}
                    onToggle={uid => setExpanded(prev => {
                        const next = new Set(prev)
                        next.has(uid) ? next.delete(uid) : next.add(uid)
                        return next
                    })}
                />
                <div className="mg-main">
                    <div className="mg-crumb">
                        {hits ? (
                            <span className="mg-crumb-cur">「{query.trim()}」的搜索结果 {hits.length} 项</span>
                        ) : (
                            <>
                                <button type="button" onClick={() => setSelected(null)}>全部书签</button>
                                {crumbs.map((n, i) => (
                                    <React.Fragment key={n.uid}>
                                        <span>/</span>
                                        {i === crumbs.length - 1
                                            ? <span className="mg-crumb-cur">{label(n, i === 0)}</span>
                                            : <button type="button" onClick={() => setSelected(n.uid)}>{label(n, i === 0)}</button>}
                                    </React.Fragment>
                                ))}
                            </>
                        )}
                    </div>
                    <ListPane
                        items={hits ? undefined : items}
                        hits={hits}
                        rootLevel={rootLevel}
                        onOpenFolder={openFolder}
                        onEdit={node => setDialog({ mode: 'edit', uid: node.uid, title: node.title, url: node.url })}
                        onDelete={del}
                        onMove={move}
                    />
                </div>
            </div>

            {dialog && <EditDialog spec={dialog} onCancel={() => setDialog(null)} onSubmit={applyDialog} />}
            {toastView(toast)}
        </div>
    )
}

function toastView(toast: { ok: boolean, text: string } | null) {
    if (!toast) {
        return null
    }
    return (
        <div className={toast.ok ? 'mg-toast good' : 'mg-toast bad'}>
            {toast.ok ? <AiOutlineCheckCircle /> : <AiOutlineExclamationCircle />}{toast.text}
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Manager />
    </React.StrictMode>,
)
