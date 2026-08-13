import express from 'express'
import cors from 'cors'
import uploadRouter from './routes/upload'
import analyzeRouter from './routes/analyze'
import chatRouter from './routes/chat'
import scanRouter from './routes/scan'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/upload', uploadRouter)
app.use('/api/analyze', analyzeRouter)
app.use('/api/chat', chatRouter)
app.use('/api/scan-dir', scanRouter)

app.get('/api/status', (_req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    capabilities: {
      securityAudit: true,
      bugDetection: true,
      performanceProfiler: true,
      codeQuality: true,
      testGenerator: true,
      codebaseChat: true,
      localDirScan: true,
    },
  })
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default app
