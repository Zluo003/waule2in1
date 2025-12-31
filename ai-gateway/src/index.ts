import 'dotenv/config';
import app from './app';
import { initDatabase } from './database';
import { midjourneyService } from './services/midjourney';

const PORT = process.env.PORT || 9000;

async function start() {
  await initDatabase();

  // 初始化 Midjourney 服务
  try {
    await midjourneyService.initialize();
    console.log('Midjourney service initialized');
  } catch (e: any) {
    console.log('Midjourney service not available:', e.message);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`AI Gateway running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/manage`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
