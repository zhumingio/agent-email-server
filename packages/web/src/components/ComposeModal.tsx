import { useEffect, useMemo, useState } from 'react';
import {
  Button, Form, Input, Modal, Select, Space, Switch, Upload, App, Tooltip,
} from 'antd';
import { InboxOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import type { MessageDetail } from '../types';
import { sendMail } from '../api';
import { useIsMobile } from '../hooks';

interface Props {
  open: boolean;
  accountId: string;
  mode: 'new' | 'reply' | 'forward';
  original?: MessageDetail | null;
  onClose: () => void;
  onSent: () => void;
}

function quoteText(m: MessageDetail): string {
  const who = m.from[0]?.name || m.from[0]?.address || '';
  const lines = (m.text || m.preview || '').split('\n').map((l) => `> ${l}`).join('\n');
  return `\n\n${who} 写道：\n${lines}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function ComposeModal({ open, accountId, mode, original, onClose, onSent }: Props) {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const [form] = Form.useForm();
  const [attachments, setAttachments] = useState<UploadFile[]>([]);
  const [useHtml, setUseHtml] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setAttachments([]);
    setUseHtml(false);
    if (mode === 'reply' && original) {
      form.setFieldsValue({
        to: original.replyTo?.length ? original.replyTo.map((a) => a.address) : original.from.map((a) => a.address),
        subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`,
        body: quoteText(original),
      });
    } else if (mode === 'forward' && original) {
      form.setFieldsValue({
        to: [],
        subject: /^fwd:/i.test(original.subject) ? original.subject : `Fwd: ${original.subject}`,
        body: `\n\n---------- 转发邮件 ----------\n发件人: ${original.from[0]?.address || ''}\n日期: ${original.date || ''}\n主题: ${original.subject}\n\n${original.text || original.preview || ''}`,
      });
    }
  }, [open, mode, original, form]);

  const doSend = async () => {
    const values = await form.validateFields();
    const atts = await Promise.all(
      attachments.map(async (f) => ({
        filename: f.name,
        contentType: f.type || 'application/octet-stream',
        content: f.originFileObj ? await fileToBase64(f.originFileObj) : String(f.thumbUrl || ''),
      }))
    );
    const text = values.body || '';
    const input = {
      to: values.to || [],
      cc: values.cc || [],
      bcc: values.bcc || [],
      subject: values.subject || '(无主题)',
      text: useHtml ? undefined : text,
      html: useHtml ? text.split('\n').map((l: string) => `<p>${l}</p>`).join('') : undefined,
      attachments: atts.length ? atts : undefined,
      inReplyTo: mode === 'reply' ? original?.messageId : undefined,
      references: mode === 'reply' && original?.references ? [...original.references, original.messageId] : undefined,
    };
    setSending(true);
    try {
      await sendMail(accountId, input);
      message.success('已发送');
      onSent();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.error || e?.message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  const replyAllHint = useMemo(() => mode === 'reply' && original ? original.cc?.length : false, [mode, original]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={mode === 'new' ? '写邮件' : mode === 'reply' ? `回复：${original?.subject || ''}` : `转发：${original?.subject || ''}`}
      width={isMobile ? '96vw' : 760}
      destroyOnHidden
      footer={null}
    >
      <Form form={form} layout="vertical" size="middle" initialValues={{ to: [], cc: [], bcc: [], subject: '', body: '' }}>
        <Form.Item label="收件人" name="to" rules={[{ required: true, message: '至少填一个收件人' }]}>
          <Select mode="tags" placeholder="收件人邮箱，回车分隔" open={false} suffixIcon={null} tokenSeparators={[',', ' ']} />
        </Form.Item>
        <Form.Item label="抄送" name="cc" style={{ marginBottom: 8 }}>
          <Select mode="tags" placeholder="抄送（可选）" open={false} suffixIcon={null} tokenSeparators={[',', ' ']} />
        </Form.Item>
        <Form.Item label="密送" name="bcc" style={{ marginBottom: 8 }}>
          <Select mode="tags" placeholder="密送（可选）" open={false} suffixIcon={null} tokenSeparators={[',', ' ']} />
        </Form.Item>
        <Form.Item label="主题" name="subject" style={{ marginBottom: 8 }}>
          <Input placeholder="邮件主题" />
        </Form.Item>
        {replyAllHint ? (
          <Tooltip title="原邮件有抄送，如需回复全部请在抄送中手动添加">
            <span style={{ fontSize: 12, color: '#999' }}>原邮件含抄送人</span>
          </Tooltip>
        ) : null}
        <Form.Item name="body" style={{ marginBottom: 8 }}>
          <Input.TextArea
            rows={10}
            placeholder="邮件正文"
            style={{ fontFamily: useHtml ? 'monospace' : 'inherit' }}
          />
        </Form.Item>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Space>
            <Upload
              multiple
              beforeUpload={() => false}
              fileList={attachments}
              onChange={({ fileList }) => setAttachments(fileList)}
            >
              <Button icon={<InboxOutlined />}>添加附件</Button>
            </Upload>
            <span style={{ fontSize: 12, color: '#999' }}>
              附件数：{attachments.length}
            </span>
          </Space>
          <Space>
            <span>HTML 格式</span>
            <Switch size="small" checked={useHtml} onChange={setUseHtml} />
          </Space>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={sending} icon={<PlusOutlined />} onClick={doSend}>
              {mode === 'new' ? '发送' : '发送'}
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
