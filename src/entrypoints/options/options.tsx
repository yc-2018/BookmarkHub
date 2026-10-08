import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Badge } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'

const Options: React.FC = () => {
    const [saved, setSaved] = useState(false);
    const savedTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        // syncForm 直接操作 DOM 完成读取与保存，表单字段只需带上正确的 name
        optionsStorage.syncForm('#formOptions');
    }, [])

    // syncForm 是静默保存的，这里给一个短暂的「已保存」反馈
    const flashSaved = () => {
        setSaved(true);
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
    };

    useEffect(() => () => window.clearTimeout(savedTimer.current), [])

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
                    <Form.Label column="sm" sm={3} lg={3} xs={4}>GitHub Token</Form.Label>
                    <Col sm={9} lg={9} xs={8}>
                        <InputGroup size="sm">
                            <Form.Control name="githubToken" type="password" placeholder="请粘贴你的 GitHub Token" size="sm" />
                            <InputGroup.Append>
                                <Button variant="outline-secondary" as="a" target="_blank" href="https://github.com/settings/tokens/new?scopes=gist&description=BookmarkHub" size="sm">获取 Token</Button>
                            </InputGroup.Append>
                        </InputGroup>
                        <Form.Text className="text-muted">
                            需要勾选 <code>gist</code> 权限范围，令牌仅保存在本机浏览器中。
                        </Form.Text>
                    </Col>
                </Form.Group>

                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={3} xs={4}>Gist ID</Form.Label>
                    <Col sm={9} lg={9} xs={8}>
                        <Form.Control name="gistID" type="text" placeholder="请填写用于存放书签的 Gist ID" size="sm" />
                        <Form.Text className="text-muted">
                            打开你的 <a href="https://gist.github.com/" target="_blank" rel="noreferrer">Gist 页面</a>，地址栏最后一段即为 Gist ID。建议新建一个私有 Gist 专用。
                        </Form.Text>
                    </Col>
                </Form.Group>

                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={3} xs={4}>Gist 文件名</Form.Label>
                    <Col sm={9} lg={9} xs={8}>
                        <Form.Control name="gistFileName" type="text" placeholder="BookmarkHub" size="sm" />
                        <Form.Text className="text-muted">
                            需与 Gist 中实际的文件名完全一致，默认为 <code>BookmarkHub</code>。
                        </Form.Text>
                    </Col>
                </Form.Group>

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
                    <a href="https://github.com/dudor/BookmarkHub" target="_blank">使用帮助</a>
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
