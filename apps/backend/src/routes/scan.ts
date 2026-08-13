import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

const router = Router()

const ScanBody = z.object({
  directoryPath: z.string(),
  maxFiles: z.number().optional().default(100),
})

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  '.turbo',
  '.cache',
  'coverage',
  '.vscode',
  '.idea',
  '__pycache__',
  'venv',
  '.env',
])

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.java',
  '.cpp',
  '.c',
  '.cs',
  '.rs',
  '.php',
  '.rb',
  '.html',
  '.css',
  '.scss',
  '.json',
  '.yaml',
  '.yml',
  '.sql',
  '.sh',
])

router.post('/', (req, res) => {
  const parsed = ScanBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() })
  }

  const { directoryPath, maxFiles } = parsed.data

  if (!fs.existsSync(directoryPath)) {
    return res.status(400).json({ error: 'Directory does not exist' })
  }

  const files: { path: string; content: string }[] = []

  function walk(dir: string, baseDir: string) {
    if (files.length >= maxFiles) return

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (files.length >= maxFiles) break

        const fullPath = path.join(dir, entry.name)
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/')

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath, baseDir)
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (ALLOWED_EXTENSIONS.has(ext)) {
            try {
              const stat = fs.statSync(fullPath)
              // Only files under 1MB
              if (stat.size < 1024 * 1024) {
                const content = fs.readFileSync(fullPath, 'utf8')
                files.push({ path: relPath, content })
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  walk(directoryPath, directoryPath)

  return res.json({
    status: 'success',
    scannedPath: directoryPath,
    filesCount: files.length,
    files,
  })
})

export default router
