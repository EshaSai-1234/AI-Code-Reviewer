import { Router } from 'express'
import { z } from 'zod'

const router = Router()

const UploadBody = z.object({
  projectName: z.string().optional(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
})

router.post('/', (req, res) => {
  const parsed = UploadBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() })
  }

  const { files, projectName } = parsed.data
  const totalLines = files.reduce((acc, f) => acc + f.content.split('\n').length, 0)
  const totalBytes = files.reduce((acc, f) => acc + Buffer.byteLength(f.content, 'utf8'), 0)

  return res.json({
    status: 'success',
    projectName: projectName || 'Uploaded Project',
    filesCount: files.length,
    totalLines,
    totalBytes,
    files: files.map((f) => ({
      path: f.path,
      lines: f.content.split('\n').length,
      sizeBytes: Buffer.byteLength(f.content, 'utf8'),
    })),
  })
})

export default router
