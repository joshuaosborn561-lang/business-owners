import cors from 'cors';
import express from 'express';
import { mountMcpHttp } from '../mcp/http.js';
import { healthPayload } from '../mcp/createServer.js';
import { config } from './config.js';
import { startTableJobSweeper } from './services/tableJobs.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ...healthPayload(),
    mcp: {
      streamableHttp: '/mcp',
      health: '/mcp/health',
      stdio: 'node dist/mcp/stdio.js',
    },
  });
});

app.get('/api/health', (_req, res) => {
  res.json(healthPayload());
});

mountMcpHttp(app);

app.listen(config.port, () => {
  startTableJobSweeper();
  console.log(
    `[business-owners] listening on :${config.port} mcp=/mcp health=/health serper=${Boolean(
      config.serperApiKey,
    )} apify=${Boolean(config.apifyToken)}`,
  );
});
