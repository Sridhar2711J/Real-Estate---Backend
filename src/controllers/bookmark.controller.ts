import { Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/authenticate';

/**
 * Standard seller fields for property owner
 */
const sellerSelectFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
};

const extractParamId = (paramId: string | string[] | undefined): string => {
  return Array.isArray(paramId) ? paramId[0] : (paramId || '');
};

/**
 * 1. GET ALL BOOKMARKS
 * @desc    Get all bookmarks for the authenticated buyer
 * @route   GET /api/bookmarks
 * @access  Private (Buyer only)
 */
export const getBookmarks = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        property: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
            },
            seller: {
              select: sellerSelectFields,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      count: bookmarks.length,
      bookmarks,
    });
  } catch (error: any) {
    logger.error('Error fetching bookmarks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bookmarks',
      error: error?.message,
    });
  }
};

/**
 * 2. ADD BOOKMARK
 * @desc    Add a property to bookmarks
 * @route   POST /api/bookmarks
 * @access  Private (Buyer only)
 */
export const addBookmark = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const { propertyId } = req.body;
    if (!propertyId || typeof propertyId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'propertyId is required in request body',
      });
      return;
    }

    // Check if property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      res.status(404).json({
        success: false,
        message: 'Property not found',
      });
      return;
    }

    // Check if already bookmarked
    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        userId_propertyId: {
          userId,
          propertyId,
        },
      },
    });

    if (existingBookmark) {
      res.status(400).json({
        success: false,
        message: 'Property is already bookmarked',
      });
      return;
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        userId,
        propertyId,
      },
      include: {
        property: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
            },
            seller: {
              select: sellerSelectFields,
            },
          },
        },
      },
    });

    logger.info(`Property ${propertyId} bookmarked by buyer ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Property bookmarked successfully',
      bookmark,
    });
  } catch (error: any) {
    logger.error('Error adding bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bookmark property',
      error: error?.message,
    });
  }
};

/**
 * 3. REMOVE BOOKMARK
 * @desc    Remove bookmark by Bookmark ID or Property ID
 * @route   DELETE /api/bookmarks/:id
 * @access  Private (Buyer only)
 */
export const removeBookmark = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const targetId = extractParamId(req.params.id);
    if (!targetId) {
      res.status(400).json({
        success: false,
        message: 'Bookmark ID or Property ID is required in URL parameter',
      });
      return;
    }

    // Find bookmark by primary ID or propertyId for this buyer
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        userId,
        OR: [
          { id: targetId },
          { propertyId: targetId },
        ],
      },
    });

    if (!existingBookmark) {
      res.status(404).json({
        success: false,
        message: 'Bookmark not found',
      });
      return;
    }

    await prisma.bookmark.delete({
      where: { id: existingBookmark.id },
    });

    logger.info(`Bookmark ${existingBookmark.id} removed by buyer ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Property removed from bookmarks successfully',
    });
  } catch (error: any) {
    logger.error('Error removing bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove bookmark',
      error: error?.message,
    });
  }
};
