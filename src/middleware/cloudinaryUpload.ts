import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage for avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'neighbourly/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' }
    ],
    public_id: (req: any, file: any) => {
      const userId = req.user?.id || 'unknown';
      return `avatar-${userId}-${Date.now()}`;
    }
  } as any,
});

// Cloudinary storage for service images
const serviceStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'neighbourly/services',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 800, height: 600, crop: 'fill' },
      { quality: 'auto', fetch_format: 'auto' }
    ],
    public_id: (req: any, file: any) => {
      const userId = req.user?.id || 'unknown';
      return `service-${userId}-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    }
  } as any,
});

// File filter
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

// Avatar upload configuration
const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  }
});

// Service images upload configuration
const serviceUpload = multer({
  storage: serviceStorage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  }
});

// Export upload functions
export const uploadAvatar = avatarUpload.single('avatar');
export const uploadServiceImages = serviceUpload.array('images', 5);

// Helper function to delete image from Cloudinary
export const deleteCloudinaryImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract public_id from Cloudinary URL
    const urlParts = imageUrl.split('/');
    const fileWithExtension = urlParts[urlParts.length - 1];
    const publicId = fileWithExtension.split('.')[0];
    
    // Include folder path in public_id
    let fullPublicId = publicId;
    if (imageUrl.includes('/avatars/')) {
      fullPublicId = `neighbourly/avatars/${publicId}`;
    } else if (imageUrl.includes('/services/')) {
      fullPublicId = `neighbourly/services/${publicId}`;
    }
    
    await cloudinary.uploader.destroy(fullPublicId);
    console.log(`Deleted image from Cloudinary: ${fullPublicId}`);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
  }
};

// Helper function to get optimized image URL
export const getOptimizedImageUrl = (publicId: string, options: any = {}): string => {
  return cloudinary.url(publicId, {
    quality: 'auto',
    fetch_format: 'auto',
    ...options
  });
};

export { cloudinary };