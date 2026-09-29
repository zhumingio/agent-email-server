import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App, Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SafetyOutlined,
} from '@ant-design/icons';
import * as api from '../api';
import { useApp } from '../store';
import type { AccountView } from '../types';

const PROVIDER_LABEL: Record<string, string> = {
  '163': '网易 163', qq: 'QQ 邮箱', '126': '网易 126', sina: '新浪邮箱', gmail: 'Gmail', outlook: 'Outlook', custom: '自定义',
};

export default function SettingsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { refreshAccounts } = useApp();

  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [providers, setProviders] = useState<{ provider: string; label: string; authType: string }[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [tab, setTab] = useState('accounts');

  const [editing, setEditing] = useState<AccountView | null>(null);
  const [form] = Form.useForm();
  const [formOpen, setFormOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oauthForm] = Form.useForm();

  const [oauthMsg, setOauthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [accs, provs, st] = await Promise.all([api.listAccounts(), api.listProviders(), api.getSettings()]);
    setAccounts(accs);
    setProviders(provs);
    setSettings(st);
    oauthForm.setFieldsValue({
      gmailClientId: st.gmailOAuth.clientId || '',
      gmailClientSecret: '',
      outlookClientId: st.outlookOAuth.clientId || '',
      outlookClientSecret: '',
    });
  }, [oauthForm]);

  useEffect(() => { load(); }, [load]);

  // OAuth 回调处理
  useEffect(() => {
    const h = window.location.hash;
    if (h.includes('oauth=success')) {
      setOauthMsg({ type: 'success', text: 'OAuth 授权成功！' });
      window.opener?.postMessage('zmail-oauth-done', '*');
      window.setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 800);
    } else if (h.includes('oauth=error')) {
      const reason = new URLSearchParams(h.split('?')[1] || '').get('reason');
      setOauthMsg({ type: 'error', text: `OAuth 授权失败${reason ? `：${decodeURIComponent(reason)}` : ''}` });
    }
    const onMsg = () => { load(); refreshAccounts(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [load, refreshAccounts]);

  useEffect(() => {
    const h = window.location.hash;
    if (h.includes('tab=accounts')) setTab('accounts');
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setFormOpen(true);
  };
  const openEdit = (acc: AccountView) => {
    setEditing(acc);
    form.setFieldsValue({
      name: acc.name, email: acc.email, provider: acc.provider,
      imapHost: acc.imapHost, imapPort: acc.imapPort, imapSecure: acc.imapSecure,
      smtpHost: acc.smtpHost, smtpPort: acc.smtpPort, smtpSecure: acc.smtpSecure,
      password: '', enabled: acc.enabled,
    });
    setFormOpen(true);
  };

  const saveAccount = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.updateAccount(editing.id, { ...v, password: v.password || undefined });
      } else {
        await api.createAccount(v);
      }
      message.success('已保存');
      setFormOpen(false);
      load();
      refreshAccounts();
    } catch (e: any) {
      message.error(api.errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const testAccount = async (id: string) => {
    setTesting(true);
    try {
      const r = await api.testAccount(id);
      if (r.ok) message.success('连接正常');
      else modal.warning({ title: '连接测试', content: <pre>{r.errors?.join('\n')}</pre> });
    } catch (e: any) {
      modal.error({ title: '连接测试', content: api.errMsg(e) });
    } finally {
      setTesting(false);
    }
  };

  const connectOAuth = async (acc: AccountView) => {
    try {
      const { url } = await api.oauthStart(acc.id);
      window.open(url, 'oauth_popup', 'width=560,height=680');
    } catch (e: any) {
      message.error(api.errMsg(e));
    }
  };

  const saveOAuth = async () => {
    const v = await oauthForm.validateFields();
    try {
      await api.saveSettings(v);
      message.success('OAuth 配置已保存');
      load();
    } catch (e: any) {
      message.error(api.errMsg(e));
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '类型', dataIndex: 'provider', key: 'provider',
      render: (p: string) => <Tag>{PROVIDER_LABEL[p] || p}</Tag>,
    },
    {
      title: '认证', key: 'auth',
      render: (_: unknown, r: AccountView) =>
        r.authType === 'oauth2' ? (
          r.oauthAuthorized ? <Tag color="green">OAuth 已授权</Tag> : <Tag color="orange">待授权</Tag>
        ) : (
          <Tag color={r.hasPassword ? 'green' : 'orange'}>{r.hasPassword ? '已设置授权码' : '未设置'}</Tag>
        ),
    },
    { title: '状态', key: 'enabled', render: (_: unknown, r: AccountView) => (r.enabled ? <Tag color="blue">启用</Tag> : <Tag>停用</Tag>) },
    {
      title: '操作', key: 'ops',
      render: (_: unknown, r: AccountView) => (
        <Space>
          {r.authType === 'oauth2' && (
            <Button size="small" type="primary" ghost onClick={() => connectOAuth(r)}>
              {r.oauthAuthorized ? '重新授权' : '连接授权'}
            </Button>
          )}
          <Button size="small" loading={testing} onClick={() => testAccount(r.id)}>测试连接</Button>
          <Button size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该账户？" onConfirm={async () => { await api.deleteAccount(r.id); load(); refreshAccounts(); }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <Space style={{ marginBottom: 16 }} size={12}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回邮箱</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>设置</Typography.Title>
      </Space>

      {oauthMsg && (
        <Alert
          type={oauthMsg.type}
          message={oauthMsg.text}
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setOauthMsg(null)}
        />
      )}

      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'accounts', label: '邮箱账户',
          children: (
            <Card title={<Space><span>邮箱账户</span><Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加账户</Button></Space>}>
              <Table rowKey="id" columns={columns} dataSource={accounts} pagination={false} size="middle" />
            </Card>
          ),
        },
        {
          key: 'oauth', label: 'OAuth 配置',
          children: (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert type="info" showIcon message="Gmail 与 Outlook 需要 OAuth2 客户端才能授权。在 Google Cloud Console / Microsoft Entra 创建应用后，把 Client ID / Client Secret 填到这里。" />
              <Card title="Google（Gmail）">
                <Form form={oauthForm} layout="vertical" style={{ maxWidth: 640 }}>
                  <Form.Item name="gmailClientId" label="Google Client ID">
                    <Input placeholder="xxxxx.apps.googleusercontent.com" />
                  </Form.Item>
                  <Form.Item name="gmailClientSecret" label="Google Client Secret" extra="留空则保持原值不变">
                    <Input.Password placeholder="仅新输入时会覆盖" />
                  </Form.Item>
                </Form>
              </Card>
              <Card title="Microsoft（Outlook / Hotmail）">
                <Form form={oauthForm} layout="vertical" style={{ maxWidth: 640 }}>
                  <Form.Item name="outlookClientId" label="Microsoft Client ID">
                    <Input placeholder="Application (client) ID" />
                  </Form.Item>
                  <Form.Item name="outlookClientSecret" label="Microsoft Client Secret" extra="留空则保持原值不变">
                    <Input.Password placeholder="仅新输入时会覆盖" />
                  </Form.Item>
                </Form>
              </Card>
              <Button type="primary" onClick={saveOAuth}>保存 OAuth 配置</Button>
            </Space>
          ),
        },
        {
          key: 'security', label: '安全',
          children: (
            <Card>
              <Descriptions column={1} bordered>
                <Descriptions.Item label="公开访问地址">
                  <Typography.Text code>{settings?.publicBaseUrl}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="API Token（Web 登录 / MCP / App 共用）">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space wrap>
                      <SafetyOutlined />
                      <Typography.Text type={settings?.apiTokenFromEnv ? 'warning' : 'success'}>
                        {settings?.apiTokenFromEnv ? '由环境变量 ZMAIL_API_TOKEN 指定' : '自动生成并持久化'}
                      </Typography.Text>
                    </Space>
                    {settings?.apiToken ? (
                      <Typography.Text code copyable style={{ wordBreak: 'break-all' }}>
                        {settings.apiToken}
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="secondary">（未生成）</Typography.Text>
                    )}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16 }}>
                <Popconfirm
                  title="重新生成 API Token 会立即使旧 Token 失效，MCP 客户端需同步更新，确定？"
                  onConfirm={async () => {
                    const t = await api.rotateToken();
                    modal.success({ title: '新 Token', content: <Typography.Text code copyable>{t}</Typography.Text> });
                  }}
                >
                  <Button danger icon={<ReloadOutlined />} disabled={settings?.apiTokenFromEnv}>
                    重新生成 API Token
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          ),
        },
        {
          key: 'display', label: '显示设置',
          children: (
            <Card title="显示设置">
              <Space direction="vertical">
                <span>每页邮件数（保存后生效）</span>
                <InputNumber min={10} max={200} defaultValue={50} onChange={(n) => useApp.setState({ pageSize: n || 50 })} />
              </Space>
            </Card>
          ),
        },
      ]} />

      <Modal
        open={formOpen}
        title={editing ? `编辑账户：${editing.email}` : '添加邮箱账户'}
        onCancel={() => setFormOpen(false)}
        onOk={saveAccount}
        okText="保存"
        confirmLoading={saving}
        width={720}
      >
        <Form form={form} layout="vertical" initialValues={{ provider: '163', imapSecure: true, smtpSecure: true, enabled: true }}>
          <Form.Item name="provider" label="邮箱类型" rules={[{ required: true }]}>
            <Select
              options={providers.map((p) => ({ value: p.provider, label: `${p.label}${p.authType === 'oauth2' ? '（OAuth2）' : '（授权码）'}` }))}
              onChange={(v) => {
                const p = providers.find((x) => x.provider === v);
                if (p) form.setFieldsValue({ authType: p.authType });
              }}
            />
          </Form.Item>
          <Form.Item name="authType" label="认证方式" hidden />
          <Space size={12} style={{ display: 'flex' }} wrap>
            <Form.Item name="name" label="显示名称" style={{ minWidth: 200 }}>
              <Input placeholder="如：工作邮箱" />
            </Form.Item>
            <Form.Item name="email" label="邮箱地址" rules={[{ required: true, message: '必填' }]} style={{ minWidth: 240 }}>
              <Input placeholder="you@example.com" />
            </Form.Item>
          </Space>

          <Typography.Text type="secondary">IMAP（接收）</Typography.Text>
          <Space size={12} wrap>
            <Form.Item name="imapHost" label="IMAP 服务器" rules={[{ required: true }]}>
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="imapPort" label="端口"><InputNumber /></Form.Item>
            <Form.Item name="imapSecure" label="SSL"><Switch size="small" /></Form.Item>
          </Space>

          <Typography.Text type="secondary">SMTP（发送）</Typography.Text>
          <Space size={12} wrap>
            <Form.Item name="smtpHost" label="SMTP 服务器" rules={[{ required: true }]}>
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="smtpPort" label="端口"><InputNumber /></Form.Item>
            <Form.Item name="smtpSecure" label="SSL"><Switch size="small" /></Form.Item>
          </Space>

          <Form.Item name="password" label={editing ? '授权码/密码（留空则不修改）' : '授权码/应用专用密码（国内邮箱在网页端开启 IMAP/SMTP 获取）'}>
            <Input.Password placeholder="OAuth2 账户无需填写，用「连接授权」按钮" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Alert type="info" showIcon message="Gmail 需在 Google Cloud 配置 OAuth 客户端后，保存账户再点「连接授权」；Outlook 同理需在 Microsoft Entra 配置。" />
        </Form>
      </Modal>
    </div>
  );
}
