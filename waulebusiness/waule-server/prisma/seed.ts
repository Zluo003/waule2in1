import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始填充数据库...');

  // ==================== 1. 创建用户 ====================
  console.log('\n📌 创建用户...');
  const hashedAdminPassword = await bcrypt.hash('admin123', 12);
  
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedAdminPassword,
      nickname: '系统管理员',
      role: 'ADMIN',
      loginType: 'ADMIN',
      credits: 100000,
      isActive: true,
    },
  });
  console.log(`✅ 管理员: ${adminUser.username}`);

  const testUser = await prisma.user.upsert({
    where: { phone: '13800138000' },
    update: {},
    create: {
      phone: '13800138000',
      nickname: '测试用户',
      role: 'USER',
      loginType: 'PHONE',
      credits: 1000,
      isActive: true,
    },
  });
  console.log(`✅ 测试用户: ${testUser.phone}`);

  // ==================== 2. 创建用户等级配置 ====================
  console.log('\n📌 创建用户等级配置...');
  const userLevelConfigs = [
    { userRole: 'USER' as const, dailyGiftCredits: 0, giftDays: 0, maxConcurrency: 1, giftDescription: '普通用户' },
    { userRole: 'VIP' as const, dailyGiftCredits: 100, giftDays: 30, maxConcurrency: 3, giftDescription: 'VIP会员每日赠送100积分' },
    { userRole: 'SVIP' as const, dailyGiftCredits: 500, giftDays: 30, maxConcurrency: 5, giftDescription: 'SVIP会员每日赠送500积分' },
    { userRole: 'ADMIN' as const, dailyGiftCredits: 0, giftDays: 0, maxConcurrency: 10, giftDescription: '管理员' },
    { userRole: 'INTERNAL' as const, dailyGiftCredits: 1000, giftDays: 365, maxConcurrency: 10, giftDescription: '内部用户' },
  ];
  
  for (const config of userLevelConfigs) {
    await prisma.userLevelConfig.upsert({
      where: { userRole: config.userRole },
      update: config,
      create: { ...config, isActive: true },
    });
  }
  console.log(`✅ 创建了 ${userLevelConfigs.length} 个用户等级配置`);

  // ==================== 3. 创建积分套餐 ====================
  console.log('\n📌 创建积分套餐...');
  const creditPackages = [
    { name: '体验包', description: '新用户体验套餐', price: 100, credits: 100, bonusCredits: 10, sortOrder: 1, type: 'RECHARGE' as const },
    { name: '基础包', description: '基础积分套餐', price: 500, credits: 500, bonusCredits: 50, sortOrder: 2, type: 'RECHARGE' as const },
    { name: '标准包', description: '标准积分套餐', price: 1000, credits: 1000, bonusCredits: 150, sortOrder: 3, type: 'RECHARGE' as const, isRecommend: true },
    { name: '专业包', description: '专业积分套餐', price: 3000, credits: 3000, bonusCredits: 600, sortOrder: 4, type: 'RECHARGE' as const },
    { name: '企业包', description: '企业积分套餐', price: 10000, credits: 10000, bonusCredits: 2500, sortOrder: 5, type: 'RECHARGE' as const },
    { name: 'VIP月卡', description: 'VIP会员月卡', price: 2900, credits: 1000, bonusCredits: 0, memberLevel: 'VIP' as const, memberDays: 30, sortOrder: 10, type: 'RECHARGE' as const },
    { name: 'SVIP月卡', description: 'SVIP会员月卡', price: 9900, credits: 5000, bonusCredits: 0, memberLevel: 'SVIP' as const, memberDays: 30, sortOrder: 11, type: 'RECHARGE' as const },
  ];
  
  for (const pkg of creditPackages) {
    // 使用 name 查找，如果存在则跳过
    const existing = await prisma.creditPackage.findFirst({ where: { name: pkg.name } });
    if (!existing) {
      await prisma.creditPackage.create({ data: { ...pkg, isActive: true } });
    }
  }
  console.log(`✅ 创建了 ${creditPackages.length} 个积分套餐`);

  // ==================== 4. 创建系统设置 ====================
  console.log('\n📌 创建系统设置...');
  const settings = [
    { key: 'system.name', value: 'AIVIDER商业版', type: 'string', category: 'system' },
    { key: 'system.version', value: '1.0.0', type: 'string', category: 'system' },
    { key: 'system.maintenance', value: 'false', type: 'boolean', category: 'system' },
    { key: 'sms.enabled', value: 'true', type: 'boolean', category: 'sms' },
    { key: 'sms.dev_mode', value: 'true', type: 'boolean', category: 'sms' },
    { key: 'storage.provider', value: 'local', type: 'string', category: 'storage' },
    { key: 'payment.enabled', value: 'false', type: 'boolean', category: 'payment' },
  ];
  
  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`✅ 创建了 ${settings.length} 个系统设置`);

  // ==================== 5. 创建示例租户 ====================
  console.log('\n📌 创建示例租户...');
  const demoTenant = await prisma.tenant.upsert({
    where: { apiKey: 'demo-api-key-12345' },
    update: {},
    create: {
      name: '演示租户',
      apiKey: 'demo-api-key-12345',
      apiSecret: 'demo-secret-67890',
      credits: 10000,
      isActive: true,
      contactName: '演示管理员',
      contactPhone: '13900139000',
      contactEmail: 'demo@example.com',
      remark: '系统演示用租户',
      maxClients: 10,
    },
  });
  console.log(`✅ 租户: ${demoTenant.name}`);

  // 创建租户管理员
  const hashedTenantPassword = await bcrypt.hash('tenant123', 12);
  const tenantAdmin = await prisma.tenantUser.upsert({
    where: { tenantId_username: { tenantId: demoTenant.id, username: 'admin' } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      username: 'admin',
      password: hashedTenantPassword,
      nickname: '租户管理员',
      isAdmin: true,
      isActive: true,
    },
  });
  console.log(`✅ 租户管理员: ${tenantAdmin.username}`);

  // 创建激活码
  await prisma.clientActivation.upsert({
    where: { activationCode: 'DEMO-ACTIVATION-001' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      activationCode: 'DEMO-ACTIVATION-001',
      deviceName: '演示设备',
      isActivated: false,
    },
  });
  console.log('✅ 激活码: DEMO-ACTIVATION-001');

  // ==================== 输出汇总 ====================
  console.log('\n' + '='.repeat(50));
  console.log('🎉 数据库初始化完成！');
  console.log('='.repeat(50));
  console.log('\n📝 账户信息汇总:');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│ 【系统管理员】                               │');
  console.log('│   账号: admin                               │');
  console.log('│   密码: admin123                            │');
  console.log('│   积分: 100000                              │');
  console.log('├─────────────────────────────────────────────┤');
  console.log('│ 【测试用户】                                 │');
  console.log('│   手机: 13800138000                         │');
  console.log('│   验证码: 任意6位数字（开发模式）           │');
  console.log('│   积分: 1000                                │');
  console.log('├─────────────────────────────────────────────┤');
  console.log('│ 【演示租户】                                 │');
  console.log('│   API Key: demo-api-key-12345               │');
  console.log('│   管理员: admin / tenant123                 │');
  console.log('│   激活码: DEMO-ACTIVATION-001               │');
  console.log('└─────────────────────────────────────────────┘');
}

main()
  .catch((e) => {
    console.error('❌ 填充数据时出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

