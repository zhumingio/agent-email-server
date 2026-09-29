import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Layout, Menu, Space, Tag, Tooltip, Typography,
} from 'antd';
import {
  MailOutlined, SettingOutlined, PlusOutlined, ReloadOutlined,
  InboxOutlined, SendOutlined, FileTextOutlined, DeleteOutlined, ExclamationCircleOutlined,
  AppstoreOutlined, FolderOpenOutlined, StarOutlined, CloudOutlined,
} from '@ant-design/icons';
import { useApp, roleLabel } from '../store';
import * as api from '../api';

const ROLE_ICON: Record<string, any> = {
  inbox: InboxOutlined,
  sent: SendOutlined,
  drafts: FileTextOutlined,
  trash: DeleteOutlined,
  spam: ExclamationCircleOutlined,
  all: AppstoreOutlined,
  archive: FolderOpenOutlined,
  important: StarOutlined,
};

/** 账户树内容（桌面 Sider / 手机抽屉共用） */
export default function AccountTree({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { accounts, mailboxesByAccount, unreadByAccount, selectedAccountId, selectAccount, refreshAccounts } = useApp();

  const items = useMemo(() => {
    const nodes: any[] = [];
    for (const acc of accounts) {
      const mbs = mailboxesByAccount[acc.id] || [];
      const children = mbs.map((mb) => {
        const Icon = ROLE_ICON[mb.role] || FolderOpenOutlined;
        const unseen = mb.role === 'inbox' ? (unreadByAccount[acc.id] ?? 0) : (mb.unseen ?? 0);
        return {
          key: `${acc.id}|${mb.path}`,
          icon: <Icon style={{ fontSize: 15 }} />,
          label: (
            <Space size={4}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleLabel(mb.role, mb.name)}</span>
              {unseen > 0 && <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px', padding: '0 5px' }}>{unseen > 99 ? '99+' : unseen}</Tag>}
            </Space>
          ),
        };
      });
      nodes.push({
        key: `acc-${acc.id}`,
        icon: <CloudOutlined style={{ color: acc.authType === 'oauth2' ? '#1677ff' : '#52c41a' }} />,
        label: (
          <Space size={6}>
            <span style={{ fontWeight: selectedAccountId === acc.id ? 600 : 400 }}>{acc.name || acc.email}</span>
            {acc.oauthProvider === 'google' && <Tag color="blue" style={{ marginInlineEnd: 0 }}>G</Tag>}
            {acc.oauthProvider === 'microsoft' && <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>O</Tag>}
            {!acc.enabled && <Tag style={{ marginInlineEnd: 0 }}>停用</Tag>}
          </Space>
        ),
        children,
      });
    }
    return nodes;
  }, [accounts, mailboxesByAccount, unreadByAccount, selectedAccountId]);

  const onMenuClick = ({ key }: { key: string }) => {
    const [accId, mailbox] = key.split('|');
    selectAccount(accId);
    window.dispatchEvent(new CustomEvent('zmail:mailbox', { detail: { accId, mailbox: mailbox || 'INBOX' } }));
    onNavigate?.();
  };

  return (
    <Layout style={{ height: '100%', background: '#fff' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Text strong style={{ fontSize: 16 }}>
          <MailOutlined style={{ color: '#1677ff', marginRight: 6 }} />
          zmail
        </Typography.Text>
        <Space size={2}>
          <Tooltip title="刷新">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => refreshAccounts()} />
          </Tooltip>
          <Tooltip title="设置">
            <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => { navigate('/settings'); onNavigate?.(); }} />
          </Tooltip>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Menu
          mode="inline"
          items={items}
          onClick={onMenuClick}
          style={{ borderInlineEnd: 'none', padding: '4px 0' }}
          selectedKeys={[]}
        />
      </div>

      <div style={{ padding: 12 }}>
        <Button block icon={<PlusOutlined />} onClick={() => { navigate('/settings?tab=accounts'); onNavigate?.(); }}>
          添加账户
        </Button>
      </div>
    </Layout>
  );
}
