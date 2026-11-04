import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

// Store incoming files in memory for fast Sharp processing
const storage = multer.memoryStorage();

// Max file size limits: 5MB for avatar, 10MB for property photos
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_PROPERTY_IMAGE_SIZE = 10 * 1024 * 1024;

export const uploadAvatarMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed.'));
    }
  },
}).single('avatar');

/**
 * Middleware wrapper to handle Multer errors gracefully
 */
export const handleAvatarUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  uploadAvatarMiddleware(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          message: 'Image size exceeds the maximum limit of 5 MB.',
        });
        return;
      }
      res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
      return;
    } else if (err) {
      res.status(400).json({
        success: false,
        message: err.message || 'Error processing uploaded file.',
      });
      return;
    }
    next();
  });
};

/**
 * Converts image buffer to high quality WebP and saves to uploads/userprofile/
 */
export const processAndSaveAvatar = async (
  buffer: Buffer,
  userId: string
): Promise<string> => {
  const uploadDir = path.join(process.cwd(), 'uploads', 'userprofile');

  // Ensure directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `avatar-${userId}-${Date.now()}.webp`;
  const targetPath = path.join(uploadDir, filename);

  // Resize to max 500x500 and convert to WebP
  await sharp(buffer)
    .resize(500, 500, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: 85 })
    .toFile(targetPath);

  return `/uploads/userprofile/${filename}`;
};

/**
 * Multer middleware for property forms (accepts 'coverImage' file and multiple 'images' files)
 */
export const uploadPropertyFilesMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_PROPERTY_IMAGE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed.'));
    }
  },
}).fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'images', maxCount: 20 },
]);

export const handlePropertyFilesUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  uploadPropertyFilesMiddleware(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          message: 'An uploaded image exceeds the maximum limit of 10 MB.',
        });
        return;
      }
      res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
      return;
    } else if (err) {
      res.status(400).json({
        success: false,
        message: err.message || 'Error processing uploaded files.',
      });
      return;
    }
    next();
  });
};

/**
 * Process and save property image as optimized WebP
 */
export const processAndSavePropertyImage = async (
  buffer: Buffer,
  sellerId: string
): Promise<string> => {
  const uploadDir = path.join(process.cwd(), 'uploads', 'properties');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `prop-${sellerId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.webp`;
  const targetPath = path.join(uploadDir, filename);

  await sharp(buffer)
    .resize(1600, 1066, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toFile(targetPath);

  return `/uploads/properties/${filename}`;
};

