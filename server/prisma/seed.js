import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const demoAccessUsers = [
  { name: 'Demo Admin', email: 'admin@mavericks.demo', role: 'Admin' },
  { name: 'Demo Coordinator', email: 'coordinator@mavericks.demo', role: 'Coordinator' },
  { name: 'Demo Trainer', email: 'trainer@mavericks.demo', role: 'Trainer' },
  { name: 'Demo Participant', email: 'participant@mavericks.demo', role: 'Participant' },
]

async function main() {
  if (process.env.ENABLE_DEMO_AUTH !== 'true') {
    console.log('No seed data applied. Database remains ready for API-driven setup.')
    return
  }

  for (const user of demoAccessUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: user,
      create: user,
    })
  }

  console.log('Demo Mode enabled: login users provisioned without operational sample data.')
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
