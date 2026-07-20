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
    if (!searchPhone || searchPhone.trim() === '') {
      return [];
    }
    
    // Only return exact match for phone number to prevent dumping all users
    return await prisma.user.findMany({
      where: {
        id: { not: userId },
        phoneNumber: searchPhone.trim()
      },
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
