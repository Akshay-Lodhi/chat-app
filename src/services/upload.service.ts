import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_KEY ? 'dnvykzhi2' : undefined,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

export class UploadService {
  static async uploadFile(filePath: string, mimetype: string) {
    // Determine resource type based on mime type
    let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';
    if (mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (mimetype.startsWith('image/')) {
      resourceType = 'image';
    }

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'whatsapp-clone',
        resource_type: resourceType
      });

      return {
        url: result.secure_url,
        type: resourceType === 'video' ? 'VIDEO' : (resourceType === 'image' ? 'IMAGE' : 'DOCUMENT'),
        format: result.format
      };
    } finally {
      // Ensure temp file is deleted even if upload fails
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
