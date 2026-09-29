import type { FastifyInstance } from 'fastify';
import { listMailboxes } from '../mail/folders.js';
import { listMessages } from '../mail/list.js';
import { fetchMessage, fetchAttachment } from '../mail/message.js';
import { sendMessage, buildReplyInput, buildForwardInput, saveDraft } from '../mail/send.js';
import { markSeen, markFlagged, moveToMailbox, trashMessages, getInboxStatus } from '../mail/actions.js';
import type { SendInput } from '../types.js';

export function registerMailRoutes(app: FastifyInstance) {
  app.get('/api/accounts/:id/mailboxes', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(await listMailboxes(id));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get('/api/accounts/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string>;
    try {
      const res = await listMessages(id, {
        mailbox: q.mailbox || 'INBOX',
        page: q.page ? parseInt(q.page, 10) : 1,
        pageSize: q.pageSize ? parseInt(q.pageSize, 10) : 50,
        query: q.query || undefined,
        unread: q.unread === 'true',
        flagged: q.flagged === 'true',
      });
      return reply.send(res);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get('/api/accounts/:id/messages/:uid', async (req, reply) => {
    const { id, uid } = req.params as { id: string; uid: string };
    const q = req.query as Record<string, string>;
    try {
      const msg = await fetchMessage(id, q.mailbox || 'INBOX', parseInt(uid, 10), {
        loadRemoteImages: q.loadRemoteImages === 'true',
      });
      if (!msg) return reply.code(404).send({ error: '邮件不存在' });
      return reply.send(msg);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get('/api/accounts/:id/messages/:uid/attachment/:index', async (req, reply) => {
    const { id, uid, index } = req.params as { id: string; uid: string; index: string };
    const q = req.query as Record<string, string>;
    try {
      const att = await fetchAttachment(id, q.mailbox || 'INBOX', parseInt(uid, 10), parseInt(index, 10));
      if (!att) return reply.code(404).send({ error: '附件不存在' });
      const filename = encodeURIComponent(att.filename || 'attachment');
      reply.header('Content-Type', att.contentType || 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      return reply.send(Buffer.from(att.data, 'base64'));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // ---- 批量操作 ----
  app.post('/api/accounts/:id/messages/mark', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { mailbox: string; uids: number[]; read: boolean };
    try {
      await markSeen(id, b.mailbox, b.uids, !!b.read);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/messages/flag', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { mailbox: string; uids: number[]; flagged: boolean };
    try {
      await markFlagged(id, b.mailbox, b.uids, !!b.flagged);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/messages/move', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { mailbox: string; uids: number[]; target: string };
    try {
      await moveToMailbox(id, b.mailbox, b.uids, b.target);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/messages/trash', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { mailbox: string; uids: number[] };
    try {
      await trashMessages(id, b.mailbox, b.uids);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // ---- 发送/回复/转发/草稿 ----
  app.post('/api/accounts/:id/send', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = req.body as SendInput;
    try {
      return reply.send(await sendMessage(id, input));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/reply', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { mailbox: string; uid: number; body: string; all?: boolean };
    try {
      const original = await fetchMessage(id, b.mailbox, b.uid);
      if (!original) return reply.code(404).send({ error: '原邮件不存在' });
      const input = buildReplyInput(original, b.body, { all: b.all });
      return reply.send(await sendMessage(id, input));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/forward', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { mailbox: string; uid: number; to: string[]; body?: string };
    try {
      const original = await fetchMessage(id, b.mailbox, b.uid);
      if (!original) return reply.code(404).send({ error: '原邮件不存在' });
      const input = buildForwardInput(original, b.to, b.body || '');
      return reply.send(await sendMessage(id, input));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/draft', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = req.body as SendInput;
    try {
      return reply.send(await saveDraft(id, input));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get('/api/accounts/:id/unread', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(await getInboxStatus(id));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
}
