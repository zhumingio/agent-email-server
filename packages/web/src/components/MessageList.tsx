import { Checkbox, Empty, Pagination, Spin, Tooltip } from 'antd';
import { PaperClipOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import type { MessageListItem } from '../types';

function fmtDate(d?: string): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (sameYear) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface Props {
  items: MessageListItem[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  selected: Set<number>;
  showTo: boolean;
  /** 手机端：单击即打开邮件（桌面为双击打开、单击选中） */
  openOnTap?: boolean;
  onToggle: (uid: number) => void;
  onOpen: (item: MessageListItem) => void;
  onPage: (page: number) => void;
}

export default function MessageList({ items, total, page, pageSize, loading, selected, showTo, openOnTap, onToggle, onOpen, onPage }: Props) {
  return (
    <div className="msg-list">
      {loading ? (
        <div className="msg-list-loading"><Spin /></div>
      ) : items.length === 0 ? (
        <Empty description="暂无邮件" style={{ marginTop: 80 }} />
      ) : (
        <>
          <div className="msg-rows">
            {items.map((m) => {
              const sender = showTo
                ? (m.to[0]?.name || m.to[0]?.address || '(未知收件人)')
                : (m.from[0]?.name || m.from[0]?.address || '(未知发件人)');
              return (
                <div
                  key={m.uid}
                  className={`msg-row ${m.seen ? '' : 'unread'} ${selected.has(m.uid) ? 'selected' : ''}`}
                  onDoubleClick={openOnTap ? undefined : () => onOpen(m)}
                  onClick={openOnTap ? () => onOpen(m) : () => onToggle(m.uid)}
                >
                  <Checkbox
                    checked={selected.has(m.uid)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggle(m.uid)}
                  />
                  <div className="msg-star" onClick={(e) => { e.stopPropagation(); }}>
                    {m.flagged ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined style={{ color: '#d9d9d9' }} />}
                  </div>
                  <div className="msg-main">
                    <div className="msg-line1">
                      <span className="msg-sender">{sender}</span>
                      <span className="msg-subject">{m.subject}</span>
                      <span className="msg-date">{fmtDate(m.date)}</span>
                    </div>
                    <div className="msg-line2">
                      {m.hasAttachments && <PaperClipOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />}
                      <span className="msg-preview">{m.preview}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="msg-pagination">
            <Pagination
              size="small"
              current={page}
              total={total}
              pageSize={pageSize}
              showSizeChanger={false}
              onChange={onPage}
              showTotal={(t) => `共 ${t} 封`}
            />
          </div>
        </>
      )}
    </div>
  );
}
