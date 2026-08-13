import { Router } from 'express'
import { z } from 'zod'
import { handleCodebaseChat } from '../services/chat'

const router = Router()

const ChatBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ),
})

router.post('/', async (req, res) => {
  const parsed = ChatBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() })
  }

  try {
    const reply = await handleCodebaseChat(parsed.data.messages, parsed.data.files)
    return res.json({ reply })
  } catch (err: any) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: err?.message || 'Chat error' })
  }
})

export default router
