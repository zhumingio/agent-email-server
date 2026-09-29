import { create } from 'zustand';
import type { AccountView, MailboxInfo, MessageListItem } from './types';
import * as api from './api';

interface AppState {
  authed: boolean;
  checkingAuth: boolean;
  accounts: AccountView[];
  mailboxesByAccount: Record<string, MailboxInfo[]>;
  unreadByAccount: Record<string, number>;
  selectedAccountId: string | null;
  selectedMailbox: string;
  pageSize: number;
  setAuthed: (v: boolean) => void;
  refreshAccounts: () => Promise<void>;
  selectAccount: (id: string | null) => void;
  setMailbox: (path: string) => void;
  setPageSize: (n: number) => void;
  setUnread: (accountId: string, n: number) => void;
}

const ROLE_LABEL: Record<string, string> = {
  inbox: '收件箱',
  sent: '已发送',
  drafts: '草稿箱',
  trash: '回收站',
  spam: '垃圾邮件',
  all: '所有邮件',
  archive: '归档',
  important: '重要',
};

export function roleLabel(role: string, fallback: string): string {
  return ROLE_LABEL[role] || fallback;
}

export const useApp = create<AppState>((set, get) => ({
  authed: false,
  checkingAuth: true,
  accounts: [],
  mailboxesByAccount: {},
  unreadByAccount: {},
  selectedAccountId: null,
  selectedMailbox: 'INBOX',
  pageSize: 50,

  setAuthed: (v) => set({ authed: v }),

  refreshAccounts: async () => {
    try {
      const accounts = await api.listAccounts();
      set({ accounts });
      const st = get();
      const active = st.selectedAccountId && accounts.some((a) => a.id === st.selectedAccountId)
        ? st.selectedAccountId
        : (accounts.length > 0 ? accounts[0].id : null);
      if (active && !st.selectedAccountId) {
        set({ selectedAccountId: active });
      }
      // 主动加载当前账户的文件夹与未读（自动选中路径也需要）
      if (active && !st.mailboxesByAccount[active]) {
        api.listMailboxes(active).then((mbs) => {
          set((s) => ({ mailboxesByAccount: { ...s.mailboxesByAccount, [active]: mbs } }));
        }).catch(() => {});
      }
      // 刷新未读
      for (const a of accounts) {
        api.getUnread(a.id).then((u) => set((s) => ({ unreadByAccount: { ...s.unreadByAccount, [a.id]: u.unseen } }))).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  },

  selectAccount: (id) => {
    set({ selectedAccountId: id, selectedMailbox: 'INBOX' });
    if (id) {
      api.listMailboxes(id).then((mbs) => {
        set((s) => ({ mailboxesByAccount: { ...s.mailboxesByAccount, [id]: mbs } }));
        api.getUnread(id).then((u) => set((s) => ({ unreadByAccount: { ...s.unreadByAccount, [id]: u.unseen } }))).catch(() => {});
      }).catch(() => {});
    }
  },

  setMailbox: (path) => set({ selectedMailbox: path }),
  setPageSize: (n) => set({ pageSize: n }),
  setUnread: (accountId, n) => set((s) => ({ unreadByAccount: { ...s.unreadByAccount, [accountId]: n } })),
}));

export type { MessageListItem };
