import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Modal, Button, Spinner, Alert } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineClear, AiOutlineSwap,
    AiOutlineInfoCircle, AiOutlineGithub, AiOutlineArrowLeft
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'
import { BookmarkInfo } from '../../utils/models'
import { getBookmarkCount } from '../../utils/bookmarks'
import { DiffResult } from '../../utils/diff'
import { OperName, sendOper } from '../../utils/messages'
import { Setting, isConfigured, providerInfo } from '../../utils/setting'
import { DiffPanel } from './DiffPanel'

type Action = 'upload' | 'download' | 'removeAll'

interface ConfirmSpec {
    action: Action
    title: string
    body: React.ReactNode
    confirmLabel: string
    variant: string
    /** 下载时复用对比阶段已拉取的远端数据 */
    useFetchedRemote?: boolean
}

const Popup: React.FC = () => {
    const [view, setView] = useState<'menu' | 'compare'>('menu')
    const [busy, setBusy] = useState<OperName | null>(null)
    const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
    const [alertMsg, setAlertMsg] = useState<{ ok: boolean; text: string } | null>(null)
    const [diff, setDiff] = useState<DiffResult | null>(null)
    const [remoteBookmarks, setRemoteBookmarks] = useState<BookmarkInfo[] | undefined>(undefined)
    const [localCount, setLocalCount] = useState<number | null>(null)
    const [remoteCount, setRemoteCount] = useState<number | null>(null)
    // null = 还在读取配置，读完才知道该显示菜单还是引导去设置
    const [configured, setConfigured] = useState<boolean | null>(null)
    // 当前存储平台名，用于界面文案
    const [providerName, setProviderName] = useState('GitHub')

    useEffect(() => {
        Setting.build().then(s => {
            setConfigured(isConfigured(s))
            setProviderName(providerInfo(s).name)
        }).catch(() => setConfigured(false))
    }, [])

    // 本地数量直接实时算，远端数量读缓存
    const refreshCounts = useCallback(async () => {
        const tree = await browser.bookmarks.getTree()
        setLocalCount(getBookmarkCount(tree as BookmarkInfo[]))
        const data = await browser.storage.local.get('remoteCount')
        const rc = data['remoteCount']
        setRemoteCount(typeof rc === 'number' ? rc : null)
    }, [])

    useEffect(() => { refreshCounts() }, [refreshCounts])


    // 对比面板需要更宽的弹窗
    useEffect(() => {
        document.body.classList.toggle('wide', view === 'compare')
    }, [view])

    const openConfirm = (spec: ConfirmSpec) => {
        setAlertMsg(null)
        setConfirm(spec)
    }

    const runConfirmed = async () => {
        if (!confirm) return
        const { action, useFetchedRemote } = confirm
        setBusy(action)
        const res = await sendOper({
            name: action,
            remoteBookmarks: action === 'download' && useFetchedRemote ? remoteBookmarks : undefined,
        })
        setBusy(null)
        setConfirm(null)
        await refreshCounts()
        if (res.ok) {
            setView('menu')
            setDiff(null)
            setRemoteBookmarks(undefined)
            setAlertMsg({ ok: true, text: successText(action) })
        } else {
            setAlertMsg({ ok: false, text: res.error ?? '操作失败' })
        }
    }

    const runCompare = async () => {
        setAlertMsg(null)
        setBusy('compare')
        const res = await sendOper({ name: 'compare' })
        setBusy(null)
        await refreshCounts()
        if (res.ok && res.diff) {
            setDiff(res.diff)
            setRemoteBookmarks(res.remoteBookmarks)
            setView('compare')
        } else {
            setAlertMsg({ ok: false, text: res.error ?? '对比失败' })
        }
    }

    const openSettings = async () => {
        await sendOper({ name: 'setting' })
        window.close()
    }

    const confirmUpload = (d?: DiffResult) => openConfirm({
        action: 'upload',
        title: '上传书签',
        variant: 'primary',
        confirmLabel: '上传覆盖远端',
        body: (
            <>
                <p className="mb-2">将用<b>本地 {localCount ?? '未知'} 个</b>书签覆盖<b>远端 {d?.remoteCount ?? remoteCount ?? '未知'} 个</b>书签，远端现有数据会被整体替换。</p>
                {d && !d.identical && (
                    <p className="mb-0 text-muted small">
                        远端将新增 {d.localOnly.length + d.folderLocalOnly.length} 项、
                        丢失 {d.remoteOnly.length + d.folderRemoteOnly.length} 项。
                    </p>
                )}
            </>
        ),
    })

    const confirmDownload = (d?: DiffResult) => openConfirm({
        action: 'download',
        title: '下载书签',
        variant: 'primary',
        confirmLabel: '下载覆盖本地',
        useFetchedRemote: !!d,
        body: (
            <>
                <p className="mb-2">将清空<b>本地 {localCount ?? '未知'} 个</b>书签，再用<b>远端 {d?.remoteCount ?? remoteCount ?? '未知'} 个</b>书签重建。</p>
                {d && !d.identical && (
                    <p className="mb-0 text-muted small">
                        本地将新增 {d.remoteOnly.length + d.folderRemoteOnly.length} 项、
                        丢失 {d.localOnly.length + d.folderLocalOnly.length} 项。
                    </p>
                )}
            </>
        ),
    })

    const confirmRemoveAll = () => openConfirm({
        action: 'removeAll',
        title: '清空本地书签',
        variant: 'danger',
        confirmLabel: '确认清空',
        body: (
            <>
                <p className="mb-2">将删除<b>本地全部 {localCount ?? '未知'} 个</b>书签，此操作不可撤销。</p>
                <p className="mb-0 text-muted small">远端数据不受影响，可随后用「下载书签」恢复。</p>
            </>
        ),
    })

    const busyIcon = (name: OperName, icon: React.ReactNode) =>
        busy === name ? <Spinner animation="border" size="sm" className="dropdown-item-icon" /> : icon

    return (
        <IconContext.Provider value={{ className: 'dropdown-item-icon' }}>
            {alertMsg && (
                <Alert
                    variant={alertMsg.ok ? 'success' : 'danger'}
                    className="popup-alert"
                    dismissible
                    closeLabel="关闭提示"
                    onClose={() => setAlertMsg(null)}
                >
                    {alertMsg.text}
                </Alert>
            )}

            {view === 'menu' ? (
                <Dropdown.Menu show>
                    {configured === null ? (
                        <Dropdown.ItemText className="popup-loading">
                            <Spinner animation="border" size="sm" /> 读取配置…
                        </Dropdown.ItemText>
                    ) : !configured ? (
                        <div className="setup-guide">
                            <div className="setup-guide-title">尚未完成配置</div>
                            <div className="setup-guide-text">
                                同步书签需要先填写 {providerName} 的访问令牌与代码片段 ID，配置完成后即可使用上传、下载和对比。
                            </div>
                            <Button size="sm" variant="primary" block onClick={openSettings}>
                                <AiOutlineSetting />前往设置
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Dropdown.Item as="button" disabled={!!busy} onClick={() => confirmUpload()} title="把本地浏览器的书签全部上传到远端 Gist">
                                {busyIcon('upload', <AiOutlineCloudUpload />)}上传书签
                            </Dropdown.Item>
                            <Dropdown.Item as="button" disabled={!!busy} onClick={() => confirmDownload()} title="先清空本地书签，再用远端 Gist 的书签重建">
                                {busyIcon('download', <AiOutlineCloudDownload />)}下载书签
                            </Dropdown.Item>
                            <Dropdown.Item as="button" disabled={!!busy} onClick={runCompare} title="拉取远端书签与本地比对，列出差异后再决定同步方向">
                                {busyIcon('compare', <AiOutlineSwap />)}对比本地与远端
                            </Dropdown.Item>
                            <Dropdown.Divider />
                            <div className="popup-split-row">
                                <button type="button" className="popup-split-item popup-split-danger" disabled={!!busy} onClick={confirmRemoveAll} title="清空本地浏览器书签，请先做好备份">
                                    {busyIcon('removeAll', <AiOutlineClear />)}清空书签
                                </button>
                                <button type="button" className="popup-split-item" disabled={!!busy} onClick={openSettings}>
                                    <AiOutlineSetting />设置
                                </button>
                            </div>
                        </>
                    )}
                    <Dropdown.ItemText className="popup-foot">
                        <a href="https://github.com/dudor/BookmarkHub" target="_blank" title="使用帮助">
                            <AiOutlineInfoCircle />帮助
                        </a>
                        <span className="popup-foot-counts" title="本地 / 远端书签数量">
                            本地 <b>{localCount ?? '—'}</b> / 远端 <b>{remoteCount ?? '—'}</b>
                        </span>
                        <a href="https://github.com/yc-2018" target="_blank" title="开发者"><AiOutlineGithub /></a>
                    </Dropdown.ItemText>
                </Dropdown.Menu>
            ) : (
                <div className="compare-view">
                    <div className="compare-head">
                        <button className="compare-back" type="button" onClick={() => setView('menu')}>
                            <AiOutlineArrowLeft />
                        </button>
                        <span className="compare-title">本地与远端对比</span>
                    </div>

                    {diff && <DiffPanel diff={diff} />}

                    <div className="compare-actions">
                        {diff && !diff.identical && (
                            <>
                                <Button size="sm" variant="outline-primary" disabled={!!busy} onClick={() => confirmUpload(diff)}>
                                    <AiOutlineCloudUpload />上传覆盖远端
                                </Button>
                                <Button size="sm" variant="outline-primary" disabled={!!busy} onClick={() => confirmDownload(diff)}>
                                    <AiOutlineCloudDownload />下载覆盖本地
                                </Button>
                            </>
                        )}
                        <Button size="sm" variant="light" disabled={!!busy} onClick={() => setView('menu')}>返回</Button>
                    </div>
                </div>
            )}

            <Modal show={!!confirm} onHide={() => !busy && setConfirm(null)} centered backdrop="static" animation={false}>
                <Modal.Header>
                    <Modal.Title as="h6">{confirm?.title}</Modal.Title>
                </Modal.Header>
                <Modal.Body className="small">{confirm?.body}</Modal.Body>
                <Modal.Footer>
                    <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setConfirm(null)}>取消</Button>
                    <Button size="sm" variant={confirm?.variant} disabled={!!busy} onClick={runConfirmed}>
                        {busy ? (<><Spinner animation="border" size="sm" /> 处理中…</>) : confirm?.confirmLabel}
                    </Button>
                </Modal.Footer>
            </Modal>
        </IconContext.Provider>
    )
}

function successText(action: Action): string {
    switch (action) {
        case 'upload': return '上传成功'
        case 'download': return '下载成功，本地书签已更新'
        case 'removeAll': return '本地书签已清空'
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);
