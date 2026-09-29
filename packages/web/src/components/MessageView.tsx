import { Button, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined, RollbackOutlined, ForwardOutlined, StarFilled, StarOutlined,
  DeleteOutlined, DownloadOutlined, PaperClipOutlined, GlobalOutlined,
} from '@ant-design/icons';
import type { MessageDetail } from '../types';
import { attachmentUrl } from '../api';

interface Props {
  detail: MessageDetail | null;
  loading: boolean;
  accountId: string;
  onClose: () => void;
  onReply: (all: boolean) => void;
  onForward: () => void;
  onToggleFlag: () => void;
  onTrash: () => void;
  onLoadRemote: () => void;
}

function addrText(a?: { name?: string; address: string }[]): string {
  if (!a || a.length === 0) return '';
  return a.map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(', ');
}

export default function MessageView({ detail, loading, accountId, onClose, onReply, onForward, onToggleFlag, onTrash, onLoadRemote }: Props) {
  if (loading && !detail) {
    return <div className="msg-view loading"><Spin size="large" /></div>;
  }
  if (!detail) {
    return <div className="msg-view empty">双击邮件查看详情</div>;
  }

  const { htmlSafe, text } = detail;

  return (
    <div className="msg-view">
      <div className="msg-view-header">
        <Space wrap>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={onClose} />
          <Tooltip title="回复">
            <Button size="small" type="primary" icon={<RollbackOutlined />} onClick={() => onReply(false)}>回复</Button>
          </Tooltip>
          <Tooltip title="回复全部">
            <Button size="small" icon={<RollbackOutlined />} onClick={() => onReply(true)}>全部</Button>
          </Tooltip>
          <Tooltip title="转发">
            <Button size="small" icon={<ForwardOutlined />} onClick={onForward}>转发</Button>
          </Tooltip>
          <Button size="small" icon={detail.flagged ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />} onClick={onToggleFlag} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={onTrash}>删除</Button>
          <Tooltip title="加载远程图片（谨慎）">
            <Button size="small" icon={<GlobalOutlined />} onClick={onLoadRemote} />
          </Tooltip>
        </Space>
      </div>

      <div className="msg-view-body">
        <Typography.Title level={4} style={{ margin: '8px 0 12px' }}>
          {detail.subject}
          {detail.flagged && <StarFilled style={{ color: '#faad14', marginLeft: 8, fontSize: 16 }} />}
        </Typography.Title>
        <div className="msg-view-meta">
          <div><b>发件人：</b>{addrText(detail.from)}</div>
          <div><b>收件人：</b>{addrText(detail.to)}</div>
          {detail.cc && detail.cc.length > 0 && <div><b>抄送：</b>{addrText(detail.cc)}</div>}
          <div><b>时间：</b>{detail.date ? new Date(detail.date).toLocaleString('zh-CN') : ''}</div>
        </div>

        {detail.attachments.length > 0 && (
          <div className="msg-attachments">
            {detail.attachments.map((att) => (
              <a
                key={att.index}
                className="msg-attachment"
                href={attachmentUrl(accountId, detail.mailbox, detail.uid, att.index)}
                download={att.filename}
              >
                <PaperClipOutlined /> {att.filename}
                <span style={{ color: '#8c8c8c', marginLeft: 6 }}>
                  {att.size ? `${(att.size / 1024).toFixed(att.size > 1048576 ? 1 : 0)} KB` : ''}
                </span>
                <DownloadOutlined style={{ marginLeft: 8 }} />
              </a>
            ))}
          </div>
        )}

        <div className="msg-view-content">
          {htmlSafe ? (
            <div
              className="mail-html"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: htmlSafe }}
            />
          ) : (
            <pre className="mail-text">{text || '(无正文)'}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
