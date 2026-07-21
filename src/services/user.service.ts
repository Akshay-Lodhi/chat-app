import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class UserService {
  static async getUserById(userId: string) {
    return await prisma.user.findUnique({
      where: { id: userId }
    });
  }

  static async updateProfile(userId: string, data: { name?: string, about?: string, profilePicture?: string }) {
    return await prisma.user.update({
      where: { id: userId },
      data
    });
  }

  static async getContacts(userId: string, searchPhone?: string) {
    const whereClause: any = { id: { not: userId } };
    
    // Optional backend filtering if a query is provided
    if (searchPhone && searchPhone.trim() !== '') {
      whereClause.OR = [
        { phoneNumber: { contains: searchPhone.trim() } },
        { name: { contains: searchPhone.trim(), mode: 'insensitive' } }
      ];
    }

    return await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        profilePicture: true,
        about: true,
        isOnline: true,
        lastSeen: true
      }
    });
  }
}
