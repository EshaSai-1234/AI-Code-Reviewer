import { Router } from 'express'
import { z } from 'zod'
import { analyzeCodebase } from '../services/analyzer'

const router = Router()

const AnalyzeBody = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ),
})

router.post('/', async (req, res) => {
  const parsed = AnalyzeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() })
  }

  try {
    const summary = await analyzeCodebase(parsed.data.files)
    return res.json(summary)
  } catch (err: any) {
    console.error('Analysis error:', err)
    return res.status(500).json({ error: err?.message || 'Failed to analyze code' })
  }
})

export default router
