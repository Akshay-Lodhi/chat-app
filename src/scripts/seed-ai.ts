import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const aiEmail = 'nexus-ai@system.local';
  
  let aiUser = await prisma.user.findUnique({
    where: { email: aiEmail }
  });

  if (!aiUser) {
    const hashedPassword = await bcrypt.hash('nexus-ai-secure-password', 10);
    aiUser = await prisma.user.create({
      data: {
        id: 'nexus-ai-system', // Predictable ID
        name: 'Nexus AI',
        email: aiEmail,
        phoneNumber: '0000000000',
        profilePicture: '/image.png',
      }
    });
    console.log('Created Nexus AI user:', aiUser.id);
  } else {
    console.log('Nexus AI user already exists:', aiUser.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
