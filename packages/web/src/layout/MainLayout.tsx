import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App, Button, Drawer, Dropdown, Input, Layout, Space, Tag, Tooltip, Typography,
} from 'antd';
import {
  EditOutlined, ReloadOutlined, ReadOutlined, DeleteOutlined,
  StarOutlined, FolderOpenOutlined, SettingOutlined, LogoutOutlined, MenuOutlined,
} from '@ant-design/icons';
import { useApp, roleLabel } from '../store';
import { useIsMobile } from '../hooks';
import * as api from '../api';
import type { MessageDetail, MessageListItem } from '../types';
import MessageList from '../components/MessageList';
import MessageView from '../components/MessageView';
import ComposeModal from '../components/ComposeModal';
import AccountTree from '../components/AccountTree';

export default function MainLayout() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    selectedAccountId, selectedMailbox, pageSize, accounts, mailboxesByAccount,
    refreshAccounts, setAuthed,
  } = useApp();
  const accountId = selectedAccountId;
  const mailbox = selectedMailbox;

  const [items, setItems] = useState<MessageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [openedUid, setOpenedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [compose, setCompose] = useState<{ open: boolean; mode: 'new' | 'reply' | 'forward'; original: MessageDetail | null }>({
    open: false, mode: 'new', original: null,
  });

  // 防御：accounts 可能尚未加载/请求失败为 undefined，兜底空数组
  const accountsSafe = Array.isArray(accounts) ? accounts : [];
  const account = useMemo(() => accountsSafe.find((a) => a.id === accountId), [accountsSafe, accountId]);
  // 兜底 || []：自动选中账户时 mailboxesByAccount[id] 可能尚未加载，避免 undefined.filter 白屏
  const mailboxes = useMemo(() => (accountId ? (mailboxesByAccount[accountId] || []) : []), [accountId, mailboxesByAccount]);

  const reloadRef = useRef<() => void>(() => {});
  const mailboxRef = useRef(mailbox);
  mailboxRef.current = mailbox;

  const reload = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await api.listMessages(accountId, {
        mailbox, page, pageSize, query: query || undefined, unread: unreadOnly || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
      setSelected(new Set());
    } catch (e: any) {
      message.error(api.errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [accountId, mailbox, page, pageSize, query, unreadOnly, message]);
  reloadRef.current = reload;

  useEffect(() => { reload(); }, [reload]);

  // SSE 实时推送（App 跨源时走 streamUrl 的 token 参数）
  useEffect(() => {
    const es = new EventSource(api.streamUrl());
    const onNew = () => {
      refreshAccounts();
      if (mailboxRef.current === 'INBOX') reloadRef.current();
    };
    es.addEventListener('new-mail', onNew);
    es.addEventListener('mailbox-changed', onNew);
    return () => es.close();
  }, [refreshAccounts]);

  // 左侧树选择邮箱
  useEffect(() => {
    const handler = (e: Event) => {
      const { mailbox: mb } = (e as CustomEvent).detail || {};
      if (mb) {
        setPage(1);
        setOpenedUid(null);
        setDetail(null);
      }
    };
    window.addEventListener('zmail:mailbox', handler);
    return () => window.removeEventListener('zmail:mailbox', handler);
  }, []);

  const openMessage = useCallback(async (item: MessageListItem) => {
    if (!accountId) return;
    setOpenedUid(item.uid);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await api.getMessage(accountId, item.mailbox, item.uid);
      setDetail(d);
      if (!d.seen) {
        await api.markRead(accountId, item.mailbox, [item.uid], true);
        reloadRef.current();
        api.getUnread(accountId).then((u) => useApp.setState((s) => ({ unreadByAccount: { ...s.unreadByAccount, [accountId]: u.unseen } }))).catch(() => {});
      }
    } catch (e: any) {
      message.error(api.errMsg(e));
    } finally {
      setDetailLoading(false);
    }
  }, [accountId, message]);

  const selectedArr = useMemo(() => [...selected], [selected]);

  const doMark = async (read: boolean) => {
    if (!accountId || !selectedArr.length) return;
    try {
      await api.markRead(accountId, mailbox, selectedArr, read);
      message.success(read ? '已标记为已读' : '已标记为未读');
      reload();
    } catch (e: any) { message.error(api.errMsg(e)); }
  };

  const doFlag = async () => {
    if (!accountId || !selectedArr.length) return;
    const allFlagged = items.filter((i) => selected.has(i.uid)).every((i) => i.flagged);
    try {
      await api.markFlagged(accountId, mailbox, selectedArr, !allFlagged);
      message.success(allFlagged ? '已取消星标' : '已加星标');
      reload();
    } catch (e: any) { message.error(api.errMsg(e)); }
  };

  const doTrash = async () => {
    if (!accountId || !selectedArr.length) return;
    try {
      await api.trash(accountId, mailbox, selectedArr);
      if (openedUid && selected.has(openedUid)) { setOpenedUid(null); setDetail(null); }
      message.success('已移入回收站');
      reload();
    } catch (e: any) { message.error(api.errMsg(e)); }
  };

  const doMove = async (target: string) => {
    if (!accountId || !selectedArr.length) return;
    try {
      await api.moveMessages(accountId, mailbox, selectedArr, target);
      message.success(`已移动到 ${target}`);
      reload();
    } catch (e: any) { message.error(api.errMsg(e)); }
  };

  const moveItems = useMemo(
    () => mailboxes.filter((m) => m.path !== mailbox).map((m) => ({ key: m.path, label: `${roleLabel(m.role, m.name)}（${m.path}）` })),
    [mailboxes, mailbox]
  );

  const showTo = ['sent', 'drafts', 'all'].includes(mailboxes.find((m) => m.path === mailbox)?.role || '');
  const mailboxTitle = `${account ? (account.name || account.email) : ''} · ${mailbox}`;

  return (
    <Layout style={{ height: '100vh' }}>
      {!isMobile && (
        <Layout.Sider width={230} theme="light" style={{ borderRight: '1px solid #f0f0f0', height: '100vh', overflow: 'auto' }}>
          <AccountTree />
        </Layout.Sider>
      )}

      <Layout>
        {isMobile && (
          <div className="mobile-topbar">
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
            <Typography.Text strong ellipsis style={{ flex: 1, textAlign: 'center', fontSize: 15 }}>{mailboxTitle}</Typography.Text>
            <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/settings')} />
          </div>
        )}

        <div className="mail-toolbar">
          <Space wrap>
            <Button type="primary" icon={<EditOutlined />} onClick={() => setCompose({ open: true, mode: 'new', original: null })}>
              写邮件
            </Button>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={() => reload()} />
            </Tooltip>
            <Input.Search
              allowClear
              placeholder="搜索"
              style={{ width: isMobile ? 140 : 240 }}
              onSearch={(v) => { setQuery(v); setPage(1); }}
            />
            <Tag.CheckableTag checked={unreadOnly} onChange={(c) => { setUnreadOnly(c); setPage(1); }}>
              未读
            </Tag.CheckableTag>
          </Space>
          <Space wrap>
            {selectedArr.length > 0 && (
              <>
                <Tag color="blue">已选 {selectedArr.length}</Tag>
                <Button size="small" icon={<ReadOutlined />} onClick={() => doMark(true)}>已读</Button>
                <Button size="small" onClick={() => doMark(false)}>未读</Button>
                <Button size="small" icon={<StarOutlined />} onClick={doFlag}>星标</Button>
                <Dropdown menu={{ items: moveItems, onClick: ({ key }) => doMove(key) }} disabled={!moveItems.length}>
                  <Button size="small" icon={<FolderOpenOutlined />}>移动到</Button>
                </Dropdown>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={doTrash}>删除</Button>
              </>
            )}
            {!isMobile && (
              <>
                <Button size="small" icon={<SettingOutlined />} onClick={() => navigate('/settings')}>设置</Button>
                <Button size="small" icon={<LogoutOutlined />} onClick={async () => { await api.logout().catch(() => {}); setAuthed(false); }}>退出</Button>
              </>
            )}
          </Space>
        </div>

        <div className="mail-panes">
          {/* 手机：打开邮件后全屏阅读；桌面：列表 + 右侧阅读区 */}
          {openedUid && isMobile ? (
            <div className="mail-detail-pane mobile">
              <MessageView
                detail={detail}
                loading={detailLoading}
                accountId={accountId || ''}
                onClose={() => { setOpenedUid(null); setDetail(null); }}
                onReply={() => { if (detail) setCompose({ open: true, mode: 'reply', original: detail }); }}
                onForward={() => { if (detail) setCompose({ open: true, mode: 'forward', original: detail }); }}
                onToggleFlag={async () => {
                  if (!accountId || !detail) return;
                  try {
                    await api.markFlagged(accountId, detail.mailbox, [detail.uid], !detail.flagged);
                    setDetail({ ...detail, flagged: !detail.flagged });
                    reload();
                  } catch (e: any) { message.error(api.errMsg(e)); }
                }}
                onTrash={async () => {
                  if (!accountId || !detail) return;
                  try {
                    await api.trash(accountId, detail.mailbox, [detail.uid]);
                    message.success('已删除');
                    setOpenedUid(null); setDetail(null);
                    reload();
                  } catch (e: any) { message.error(api.errMsg(e)); }
                }}
                onLoadRemote={async () => {
                  if (!accountId || !detail) return;
                  try {
                    const d = await api.getMessage(accountId, detail.mailbox, detail.uid, true);
                    setDetail(d);
                  } catch (e: any) { message.error(api.errMsg(e)); }
                }}
              />
            </div>
          ) : (
            <>
              <div className="mail-list-pane">
                <div className="mail-list-title">
                  <Typography.Text strong ellipsis>{mailboxTitle}</Typography.Text>
                  {total > 0 && <Tag style={{ marginLeft: 8 }}>{total} 封</Tag>}
                </div>
                <MessageList
                  items={items}
                  total={total}
                  page={page}
                  pageSize={pageSize}
                  loading={loading}
                  selected={selected}
                  showTo={showTo}
                  openOnTap={isMobile}
                  onToggle={(uid) => setSelected((prev) => {
                    const n = new Set(prev);
                    if (n.has(uid)) n.delete(uid); else n.add(uid);
                    return n;
                  })}
                  onOpen={openMessage}
                  onPage={setPage}
                />
              </div>
              {openedUid && !isMobile && (
                <div className="mail-detail-pane">
                  <MessageView
                    detail={detail}
                    loading={detailLoading}
                    accountId={accountId || ''}
                    onClose={() => { setOpenedUid(null); setDetail(null); }}
                    onReply={(all) => { if (detail) setCompose({ open: true, mode: 'reply', original: detail }); void all; }}
                    onForward={() => { if (detail) setCompose({ open: true, mode: 'forward', original: detail }); }}
                    onToggleFlag={async () => {
                      if (!accountId || !detail) return;
                      try {
                        await api.markFlagged(accountId, detail.mailbox, [detail.uid], !detail.flagged);
                        setDetail({ ...detail, flagged: !detail.flagged });
                        reload();
                      } catch (e: any) { message.error(api.errMsg(e)); }
                    }}
                    onTrash={async () => {
                      if (!accountId || !detail) return;
                      try {
                        await api.trash(accountId, detail.mailbox, [detail.uid]);
                        message.success('已删除');
                        setOpenedUid(null); setDetail(null);
                        reload();
                      } catch (e: any) { message.error(api.errMsg(e)); }
                    }}
                    onLoadRemote={async () => {
                      if (!accountId || !detail) return;
                      try {
                        const d = await api.getMessage(accountId, detail.mailbox, detail.uid, true);
                        setDetail(d);
                      } catch (e: any) { message.error(api.errMsg(e)); }
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Layout>

      {/* 手机抽屉导航 */}
      <Drawer
        placement="left"
        width={260}
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <AccountTree onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <ComposeModal
        open={compose.open}
        accountId={accountId || ''}
        mode={compose.mode}
        original={compose.original}
        onClose={() => setCompose((c) => ({ ...c, open: false }))}
        onSent={() => reload()}
      />
    </Layout>
  );
}
