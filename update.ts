import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.user.update({ where: { id: 'nexus-ai-system' }, data: { profilePicture: '/image.png' } }).then(() => console.log('Updated')).catch(console.error).finally(() => prisma.$disconnect());
