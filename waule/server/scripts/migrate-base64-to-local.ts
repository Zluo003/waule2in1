import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// 本地存储目录
const LOCAL_STORAGE_DIR = path.join(__dirname, '../../public/images');
const PUBLIC_URL_BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

// 确保存储目录存在
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

// 将 base64 转换为文件
function base64ToFile(base64Data: string): { filename: string; filepath: string; url: string } {
  // 提取 base64 数据和 MIME 类型
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 data');
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const buffer = Buffer.from(base64, 'base64');

  // 生成唯一文件名
  const hash = crypto.createHash('md5').update(buffer).digest('hex');
  const ext = mimeType.split('/')[1] || 'png';
  const filename = `${hash}.${ext}`;
  const filepath = path.join(LOCAL_STORAGE_DIR, filename);

  // 如果文件已存在，直接返回
  if (fs.existsSync(filepath)) {
    return {
      filename,
      filepath,
      url: `${PUBLIC_URL_BASE}/images/${filename}`
    };
  }

  // 保存文件
  fs.writeFileSync(filepath, buffer);

  return {
    filename,
    filepath,
    url: `${PUBLIC_URL_BASE}/images/${filename}`
  };
}

// 递归处理对象中的 base64 数据
function processObject(obj: any, stats: { converted: number; skipped: number }): any {
  if (typeof obj === 'string') {
    // 检查是否是 base64 图片
    if (obj.startsWith('data:image/')) {
      try {
        const { url } = base64ToFile(obj);
        stats.converted++;
        console.log(`  ✓ 转换 base64 -> ${url}`);
        return url;
      } catch (error) {
        console.error(`  ✗ 转换失败:`, error);
        stats.skipped++;
        return obj;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => processObject(item, stats));
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = processObject(obj[key], stats);
    }
    return result;
  }

  return obj;
}

async function migrateWorkflows() {
  console.log('开始迁移工作流中的 base64 图片...\n');

  const workflows = await prisma.workflow.findMany({
    select: {
      id: true,
      name: true,
      data: true,
    },
  });

  console.log(`找到 ${workflows.length} 个工作流\n`);

  let totalConverted = 0;
  let totalSkipped = 0;
  let updatedWorkflows = 0;

  for (const workflow of workflows) {
    const dataStr = JSON.stringify(workflow.data);

    // 检查是否包含 base64 图片
    if (!dataStr.includes('data:image/')) {
      continue;
    }

    console.log(`处理工作流: ${workflow.name} (${workflow.id})`);
    console.log(`  原始数据大小: ${(dataStr.length / 1024).toFixed(2)} KB`);

    const stats = { converted: 0, skipped: 0 };
    const newData = processObject(workflow.data, stats);

    if (stats.converted > 0) {
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { data: newData as any },
      });

      const newDataStr = JSON.stringify(newData);
      console.log(`  新数据大小: ${(newDataStr.length / 1024).toFixed(2)} KB`);
      console.log(`  节省: ${((dataStr.length - newDataStr.length) / 1024).toFixed(2)} KB`);
      console.log(`  转换: ${stats.converted} 个图片\n`);

      totalConverted += stats.converted;
      updatedWorkflows++;
    }

    totalSkipped += stats.skipped;
  }

  console.log('\n迁移完成！');
  console.log(`更新的工作流: ${updatedWorkflows}`);
  console.log(`转换的图片: ${totalConverted}`);
  console.log(`跳过的图片: ${totalSkipped}`);
}

async function main() {
  try {
    await migrateWorkflows();
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
