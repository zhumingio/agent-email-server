import { useEffect, useState } from 'react';
import { Button, Form, Input, Alert, Typography, Space } from 'antd';
import { LockOutlined, MailOutlined, CloudServerOutlined } from '@ant-design/icons';
import * as api from './api';
import { useApp } from './store';

declare global {
  interface Window {
    // Capacitor 注入
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  }
}

function detectPlatform(): string {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return window.Capacitor.getPlatform?.() || 'native';
  } catch { /* ignore */ }
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android-web';
  if (/windows/i.test(ua)) return 'windows-web';
  if (/tauri/i.test(ua)) return 'tauri';
  return 'web';
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [probeResult, setProbeResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const setAuthed = useApp((s) => s.setAuthed);
  const [form] = Form.useForm();

  useEffect(() => {
    const server = api.getServerBase();
    form.setFieldsValue({ server });
  }, [form]);

  const checkServer = async (server: string) => {
    setConnecting(true);
    setError('');
    setProbeResult(null);
    try {
      api.setServerBase(server);
      const info = await api.appInfo();
      setProbeResult({ ok: true, msg: `连接成功：zmail v${info.version}（${new Date(info.serverTime).toLocaleString() ?? ''}）` });
      setError('');
      return info;
    } catch (e: any) {
      setProbeResult({ ok: false, msg: `无法连接服务器：${api.errMsg(e)}` });
      setError(`无法连接服务器：${api.errMsg(e)}`);
      return null;
    } finally {
      setConnecting(false);
    }
  };

  const onFinish = async (values: { server?: string; token: string }) => {
    if (values.server) {
      const info = await checkServer(values.server);
      if (!info) return; // 失败已在顶部提示，阻止登录
    }
    setLoading(true);
    setError('');
    try {
      await api.login(values.token.trim());
      // App 端设备注册（为将来推送预留）
      try {
        let deviceId = localStorage.getItem('zmail_device_id');
        if (!deviceId) {
          deviceId = `${crypto.randomUUID?.() || Date.now()}`;
          localStorage.setItem('zmail_device_id', deviceId);
        }
        api.registerDevice({ deviceId, platform: detectPlatform() }).catch(() => {});
      } catch { /* ignore */ }
      setAuthed(true);
    } catch (e: any) {
      api.setStoredToken('');
      setError(e?.response?.status === 401 ? 'Token 无效，请检查后重试' : api.errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <MailOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          <Typography.Title level={3} style={{ margin: '12px 0 0' }}>
            zmail 邮箱客户端
          </Typography.Title>
          <Typography.Text type="secondary">Web / Windows / Android 共用同一套账户</Typography.Text>
        </div>
        {probeResult && (
          <Alert
            type={probeResult.ok ? 'success' : 'error'}
            message={probeResult.ok ? '服务器可达' : '连接失败'}
            description={probeResult.msg}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        {error && !probeResult && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form form={form} onFinish={onFinish} layout="vertical" initialValues={{ token: '' }}>
          <Form.Item
            name="server"
            label={<Space size={4}><CloudServerOutlined />服务器地址</Space>}
            extra="留空则连接当前页面所在的服务器（App 中需填，如 https://mail.example.com）"
          >
            <Input
              placeholder="https://mail.example.com"
              size="large"
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  loading={connecting}
                  onClick={async () => { const s = form.getFieldValue('server'); if (s) checkServer(s); }}
                  style={{ padding: 0 }}
                >
                  探测
                </Button>
              }
            />
          </Form.Item>
          <Form.Item name="token" rules={[{ required: true, message: '请输入 Token' }]}>
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="API Token（部署时设置，见设置页/部署日志）"
              size="large"
              autoFocus
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
