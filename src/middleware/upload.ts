import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

// Store incoming files in memory for fast Sharp processing
const storage = multer.memoryStorage();

// Max 5MB file size limit
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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

