import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const LOCAL_STORAGE_DIR = path.join(__dirname, '../../public/images');
const PUBLIC_URL_BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

function base64ToFile(base64Data: string): string {
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 data');
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const buffer = Buffer.from(base64, 'base64');

  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  const ext = mimeType.split('/')[1] || 'png';
  const filename = `${hash}.${ext}`;
  const filepath = path.join(LOCAL_STORAGE_DIR, filename);

  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, buffer);
  }

  return `${PUBLIC_URL_BASE}/images/${filename}`;
}

function processReferenceImages(images: any[]): any[] {
  if (!Array.isArray(images)) return images;

  return images.map(img => {
    if (typeof img === 'string' && img.startsWith('data:image/')) {
      try {
        return base64ToFile(img);
      } catch (error) {
        console.error('转换失败:', error);
        return img;
      }
    }
    return img;
  });
}

async function cleanTasks() {
  console.log('开始清理任务表中的 base64 图片...\n');

  // 分批处理，每次100个
  const batchSize = 100;
  let offset = 0;
  let totalConverted = 0;
  let totalSkipped = 0;
  let totalSaved = 0;
  let hasMore = true;

  while (hasMore) {
    const tasks = await prisma.generationTask.findMany({
      where: {
        referenceImages: {
          not: null,
        },
      },
      select: {
        id: true,
        type: true,
        referenceImages: true,
      },
      skip: offset,
      take: batchSize,
    });

    if (tasks.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`处理批次 ${Math.floor(offset / batchSize) + 1}，任务数: ${tasks.length}`);

    for (const task of tasks) {
      const refImages = task.referenceImages as any;
      if (!refImages) continue;

      const refStr = JSON.stringify(refImages);
      if (!refStr.includes('data:image/')) {
        totalSkipped++;
        continue;
      }

      const originalSize = refStr.length;
      const newImages = processReferenceImages(refImages);
      const newSize = JSON.stringify(newImages).length;
      const saved = originalSize - newSize;

      if (saved > 0) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: { referenceImages: newImages as any },
        });

        totalConverted++;
        totalSaved += saved;
      } else {
        totalSkipped++;
      }
    }

    console.log(`  已转换: ${totalConverted}, 已跳过: ${totalSkipped}, 节省: ${(totalSaved / 1024 / 1024).toFixed(2)} MB\n`);

    offset += batchSize;
  }

  console.log('\n清理完成！');
  console.log(`转换的任务: ${totalConverted}`);
  console.log(`跳过的任务: ${totalSkipped}`);
  console.log(`节省空间: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

async function main() {
  try {
    await cleanTasks();
  } catch (error) {
    console.error('清理失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
