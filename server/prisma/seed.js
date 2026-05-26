// Seeds approved baseline identities and reference records for controlled environments.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const demoAccessUsers = [
  { name: 'Mavericks Admin', email: 'admin@mavericks.demo', role: 'Admin', status: 'Active' },
  { name: 'Mavericks Coordinator', email: 'coordinator@mavericks.demo', role: 'Coordinator', status: 'Active' },
  { name: 'Avery Shah', email: 'trainer@mavericks.demo', role: 'Trainer', status: 'Active' },
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
