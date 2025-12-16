import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始填充数据库...');

  // 清理现有数据（可选，开发时使用）
  console.log('清理现有数据...');
  await prisma.session.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.node.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.scene.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.project.deleteMany();
  await prisma.aIModel.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  // 初始化用户等级配置（积分赠送规则）
  console.log('初始化用户等级配置...');
  await prisma.userLevelConfig.upsert({
    where: { userRole: 'USER' },
    update: {},
    create: {
      userRole: 'USER',
      dailyGiftCredits: 200,  // 每日赠送200积分
      giftDays: 7,            // 前7天有效
      giftDescription: '新用户注册后7天内，每天赠送200积分（不累加，补足到200）',
      maxConcurrency: 1,
      isActive: true,
    },
  });
  await prisma.userLevelConfig.upsert({
    where: { userRole: 'VIP' },
    update: {},
    create: {
      userRole: 'VIP',
      dailyGiftCredits: 0,
      giftDays: 0,
      giftDescription: 'VIP会员',
      maxConcurrency: 3,
      isActive: true,
    },
  });
  await prisma.userLevelConfig.upsert({
    where: { userRole: 'SVIP' },
    update: {},
    create: {
      userRole: 'SVIP',
      dailyGiftCredits: 0,
      giftDays: 0,
      giftDescription: 'SVIP会员',
      maxConcurrency: 5,
      isActive: true,
    },
  });
  console.log('✅ 用户等级配置初始化完成');

  // 创建管理员用户（使用账号密码登录）
  console.log('创建管理员用户...');
  const hashedAdminPassword = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedAdminPassword,
      nickname: '管理员',
      role: 'ADMIN',
      loginType: 'ADMIN',
      credits: 10000, // 管理员给更多积分
      isActive: true,
    },
  });
  console.log(`✅ 创建管理员: ${adminUser.username}`);

  // 创建测试用户（使用手机号登录）
  console.log('创建测试用户...');
  const testUser = await prisma.user.create({
    data: {
      phone: '13800138000',
      nickname: '测试用户',
      role: 'USER',
      loginType: 'PHONE',
      credits: 1000,
      isActive: true,
    },
  });
  console.log(`✅ 创建测试用户: ${testUser.phone}`);

  // 不创建其它模拟数据（项目/集数/场景/工作流/模型/系统设置）

  console.log('\n🎉 基础用户创建完成！');
  console.log('\n📝 账户信息:');
  console.log('┌─────────────────────────────────────┐');
  console.log('│ 管理员账户（账号密码登录）           │');
  console.log('├─────────────────────────────────────┤');
  console.log('│ 账号: admin                         │');
  console.log('│ 密码: admin123                      │');
  console.log('│ 积分: 10000                         │');
  console.log('├─────────────────────────────────────┤');
  console.log('│ 测试用户（手机号登录）               │');
  console.log('├─────────────────────────────────────┤');
  console.log('│ 手机: 13800138000                   │');
  console.log('│ 验证码: 任意6位数字（开发模式）     │');
  console.log('│ 积分: 1000                          │');
  console.log('└─────────────────────────────────────┘');
  console.log('\n✨ 管理员使用账号密码登录，普通用户使用手机验证码登录！');
}

main()
  .catch((e) => {
    console.error('❌ 填充数据时出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

