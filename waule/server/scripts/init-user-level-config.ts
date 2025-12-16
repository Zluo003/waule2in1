/**
 * 初始化/更新用户等级配置
 * 运行方式: npx ts-node scripts/init-user-level-config.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 开始初始化用户等级配置...\n');

  // 配置 USER 等级的积分赠送规则
  // 注意：使用空 update 以保护已有配置，避免覆盖管理员手动修改的值
  const userConfig = await prisma.userLevelConfig.upsert({
    where: { userRole: 'USER' },
    update: {}, // 如果已存在则不更新，保护现有配置
    create: {
      userRole: 'USER',
      dailyGiftCredits: 200,
      giftDays: 7,
      giftDescription: '新用户注册后7天内，每天赠送200积分（不累加，补足到200）',
      maxConcurrency: 1,
      isActive: true,
    },
  });
  console.log('✅ USER 等级配置:', userConfig);

  // 确保 VIP 和 SVIP 配置存在
  const vipConfig = await prisma.userLevelConfig.upsert({
    where: { userRole: 'VIP' },
    update: {}, // 如果已存在则不更新，保护现有配置
    create: {
      userRole: 'VIP',
      dailyGiftCredits: 0,
      giftDays: 0,
      giftDescription: 'VIP会员',
      maxConcurrency: 3,
      isActive: true,
    },
  });
  console.log('✅ VIP 等级配置:', vipConfig);

  const svipConfig = await prisma.userLevelConfig.upsert({
    where: { userRole: 'SVIP' },
    update: {}, // 如果已存在则不更新，保护现有配置
    create: {
      userRole: 'SVIP',
      dailyGiftCredits: 0,
      giftDays: 0,
      giftDescription: 'SVIP会员',
      maxConcurrency: 5,
      isActive: true,
    },
  });
  console.log('✅ SVIP 等级配置:', svipConfig);

  console.log('\n🎉 用户等级配置初始化完成！');
}

main()
  .catch((e) => {
    console.error('❌ 执行出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

