import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Badge } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'
import { PROVIDERS, ProviderId } from '../../utils/setting'

/**
 * 一组平台凭据。非活动平台的那组仍留在 DOM 里但整体 disabled ——
 * syncForm 保存时会跳过 disabled 字段，所以切换平台不会把另一套凭据覆盖成空值。
 */
const CredentialGroup: React.FC<{ id: ProviderId; active: boolean }> = ({ id, active }) => {
    const info = PROVIDERS[id];
    const hidden = active ? '' : 'd-none ';
    return (
        <>
            <Form.Group as={Row} className={hidden + 'cred-group'}>
                <Form.Label column="sm" sm={3} lg={3} xs={4}>访问令牌</Form.Label>
                <Col sm={9} lg={9} xs={8}>
                    <InputGroup size="sm">
                        <Form.Control
                            name={id === 'gitee' ? 'giteeToken' : 'githubToken'}
                            type="password"
                            placeholder={`请粘贴你的 ${info.name} 访问令牌`}
                            size="sm"
                            disabled={!active}
                        />
                        <InputGroup.Append>
                            <Button variant="outline-secondary" as="a" target="_blank" rel="noreferrer" href={info.tokenUrl} size="sm">
                                获取令牌
                            </Button>
                        </InputGroup.Append>
                    </InputGroup>
                    <Form.Text className="text-muted">
                        需要勾选 {id === 'gitee' ? 'gists' : 'gist'} 权限范围，令牌仅保存在本机浏览器中。
                    </Form.Text>
                </Col>
            </Form.Group>

            <Form.Group as={Row} className={hidden}>
                <Form.Label column="sm" sm={3} lg={3} xs={4}>代码片段 ID</Form.Label>
                <Col sm={9} lg={9} xs={8}>
                    <Form.Control
                        name={id === 'gitee' ? 'giteeGistID' : 'gistID'}
                        type="text"
                        placeholder="请填写用于存放书签的代码片段 ID"
                        size="sm"
                        disabled={!active}
                    />
                    <Form.Text className="text-muted">
                        打开你的 <a href={info.newGistUrl} target="_blank" rel="noreferrer">{info.name} 代码片段页面</a>，
                        地址栏最后一段即为 ID。建议新建一个私有代码片段专用。
                    </Form.Text>
                </Col>
            </Form.Group>
        </>
    )
}

const Options: React.FC = () => {
    const [saved, setSaved] = useState(false);
    const [provider, setProvider] = useState<ProviderId>('github');
    const savedTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        // syncForm 直接操作 DOM 完成读取与保存，表单字段只需带上正确的 name
        optionsStorage.syncForm('#formOptions');
        // 平台选择要驱动界面切换，所以额外取一次当前值
        optionsStorage.getAll().then(o => {
            setProvider(o.provider === 'gitee' ? 'gitee' : 'github');
        });
    }, [])

    // syncForm 是静默保存的，这里给一个短暂的「已保存」反馈
    const flashSaved = () => {
        setSaved(true);
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
    };

    useEffect(() => () => window.clearTimeout(savedTimer.current), [])

    const info = PROVIDERS[provider];

    return (
        <Container>
            <div className="options-head">
                <h6 className="options-title">BookmarkHub 设置</h6>
                <span className="options-saved-slot">
                    {saved && <Badge variant="success">已保存</Badge>}
                </span>
            </div>
            <Form id='formOptions' name='formOptions' onInput={flashSaved}>
                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={3} xs={4}>存储平台</Form.Label>
                    <Col sm={9} lg={9} xs={8}>
                        <Form.Control
                            as="select"
                            name="provider"
                            size="sm"
                            value={provider}
                            onChange={e => setProvider(e.target.value === 'gitee' ? 'gitee' : 'github')}
                        >
                            <option value="github">GitHub（gist.github.com）</option>
                            <option value="gitee">Gitee 码云（gitee.com/codes）</option>
                        </Form.Control>
                        <Form.Text className="text-muted">
                            两个平台各存一套凭据，随时可切换，已填内容不会丢。切换后上传、下载、对比都走所选平台。
                        </Form.Text>
                    </Col>
                </Form.Group>

                <hr />
                <div className="options-section">当前使用：{info.name}</div>

                <CredentialGroup id="github" active={provider === 'github'} />
                <CredentialGroup id="gitee" active={provider === 'gitee'} />

                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={3} xs={4}>文件名</Form.Label>
                    <Col sm={9} lg={9} xs={8}>
                        <Form.Control name="gistFileName" type="text" placeholder="BookmarkHub" size="sm" />
                        <Form.Text className="text-muted">
                            两个平台共用，需与代码片段中实际的文件名完全一致，默认为 <code>BookmarkHub</code>。
                            {info.descriptionMaxLength
                                ? ` ${info.name} 的片段描述上限 ${info.descriptionMaxLength} 字符，过长的文件名会被自动截断。`
                                : ''}
                        </Form.Text>
                    </Col>
                </Form.Group>

                <hr />

                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={3} xs={4}>使用消息通知</Form.Label>
                    <Col sm={9} lg={9} xs={8}>
                        <Form.Check
                            id="enableNotify"
                            name="enableNotify"
                            type="switch"
                            label=""
                        />
                        <Form.Text className="text-muted">
                            同步出错时以系统通知提醒（弹窗内始终会显示结果）。
                        </Form.Text>
                    </Col>
                </Form.Group>

                <hr />

                <div className="options-foot">
                    <span className="text-muted">修改后自动保存</span>
                    <a href="https://github.com/yc-2018/BookmarkHub" target="_blank" rel="noreferrer">使用帮助</a>
                </div>
            </Form>
        </Container>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Options />
    </React.StrictMode>,
);
