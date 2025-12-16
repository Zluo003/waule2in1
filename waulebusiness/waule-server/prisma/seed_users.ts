import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = 'admin@waule.com'
  const adminUsername = 'admin'
  const adminPassword = 'admin123'

  const userEmail = 'user@waule.com'
  const userUsername = 'testuser'
  const userPassword = 'user123'

  const adminHashed = await bcrypt.hash(adminPassword, 12)
  const userHashed = await bcrypt.hash(userPassword, 12)

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      username: adminUsername,
      password: adminHashed,
      nickname: '管理员',
      role: 'ADMIN',
      isActive: true,
    },
  })

  const testUser = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      username: userUsername,
      password: userHashed,
      nickname: '测试用户',
      role: 'USER',
      isActive: true,
    },
  })

  console.log('✅ 管理员:', admin.email)
  console.log('✅ 测试用户:', testUser.email)
}

main()
  .catch((e) => {
    console.error('❌ 用户初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })