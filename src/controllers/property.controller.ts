import { Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { processAndSavePropertyImage } from '../middleware/upload';

/**
 * Standard Seller Selection (Sanitized, no sensitive credentials)
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
 * Helper to build a clean, SEO-friendly slug
 */
const createSlugString = (title: string): string => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Ensures unique slug in database
 */
const generateUniqueSlug = async (title: string, customSlug?: string): Promise<string> => {
  let baseSlug = customSlug && customSlug.trim()
    ? createSlugString(customSlug)
    : createSlugString(title);

  if (!baseSlug) {
    baseSlug = `property-${Date.now()}`;
  }

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.property.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

/**
 * Helper to process and store base64 data URLs as optimized WebP files in uploads/properties
 */
const saveImageIfBase64 = async (imageInput: string, sellerId: string): Promise<string> => {
  if (!imageInput || typeof imageInput !== 'string') return imageInput;
  if (!imageInput.startsWith('data:image/')) return imageInput;

  try {
    const base64Data = imageInput.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    return await processAndSavePropertyImage(buffer, sellerId);
  } catch (err) {
    logger.warn('Failed to convert base64 image to file, falling back to original string:', err);
    return imageInput;
  }
};

/**
 * CREATE PROPERTY
 * POST /api/properties
 * Access: Private (Seller only)
 */
export const createProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'seller') {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Only sellers are authorized to create properties.',
      });
      return;
    }

    const {
      title,
      slug: customSlug,
      description,
      features,
      price,
      propertyType,
      city,
      location,
      address,
      bedrooms,
      bathrooms,
      area,
      coverImage,
      status,
      images,
    } = req.body;

    // Field Validations
    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({
        success: false,
        message: 'Title is required.',
      });
      return;
    }

    if (!propertyType || typeof propertyType !== 'string' || !propertyType.trim()) {
      res.status(400).json({
        success: false,
        message: 'Property type is required.',
      });
      return;
    }

    if (price === undefined || isNaN(Number(price)) || Number(price) <= 0) {
      res.status(400).json({
        success: false,
        message: 'A valid positive price is required.',
      });
      return;
    }

    if (!city || typeof city !== 'string' || !city.trim()) {
      res.status(400).json({
        success: false,
        message: 'City is required.',
      });
      return;
    }

    if (!location || typeof location !== 'string' || !location.trim()) {
      res.status(400).json({
        success: false,
        message: 'Location is required.',
      });
      return;
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({
        success: false,
        message: 'Description is required.',
      });
      return;
    }

    if (!coverImage || typeof coverImage !== 'string' || !coverImage.trim()) {
      res.status(400).json({
        success: false,
        message: 'Cover image is required.',
      });
      return;
    }

    // Generate unique slug
    const finalSlug = await generateUniqueSlug(title, customSlug);

    // Parse features
    const parsedFeatures: string[] = Array.isArray(features)
      ? features.map((f: any) => String(f).trim()).filter(Boolean)
      : [];

    // Process cover image (convert base64 to WebP file if sent directly)
    const finalCoverImage = await saveImageIfBase64(coverImage.trim(), user.id);

    // Parse gallery images (convert base64 to WebP files if sent directly)
    const parsedImages = Array.isArray(images)
      ? await Promise.all(
          images
            .filter((img: any) => img && typeof img.url === 'string' && img.url.trim())
            .map(async (img: any, idx: number) => ({
              url: await saveImageIfBase64(img.url.trim(), user.id),
              caption: img.caption ? String(img.caption).trim() : null,
              sortOrder: typeof img.sortOrder === 'number' ? img.sortOrder : idx + 1,
            }))
        )
      : [];

    // Valid status values
    const allowedStatuses = ['active', 'inactive', 'sold'];
    const finalStatus = allowedStatuses.includes(status) ? status : 'active';

    // Create in Database with sellerId and unique slug
    const newProperty = await prisma.property.create({
      data: {
        title: title.trim(),
        slug: finalSlug,
        description: description.trim(),
        features: parsedFeatures,
        price: Number(price),
        propertyType: propertyType.trim().toLowerCase(),
        city: city.trim(),
        location: location.trim(),
        address: address && typeof address === 'string' ? address.trim() : null,
        bedrooms: bedrooms !== undefined && !isNaN(Number(bedrooms)) ? Number(bedrooms) : 0,
        bathrooms: bathrooms !== undefined && !isNaN(Number(bathrooms)) ? Number(bathrooms) : 0,
        area: area !== undefined && !isNaN(Number(area)) ? Number(area) : 0,
        coverImage: finalCoverImage,
        status: finalStatus,
        sellerId: user.id, // Strictly tied to authenticated seller
        images: {
          create: parsedImages,
        },
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        seller: {
          select: sellerSelectFields,
        },
      },
    });

    logger.info(`Property created successfully: ${newProperty.id} (${newProperty.slug}) by seller: ${user.id}`);

    res.status(201).json({
      success: true,
      message: 'Property created successfully.',
      property: newProperty,
    });
  } catch (error: any) {
    logger.error('Error creating property:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating property.',
      error: error?.message,
    });
  }
};

/**
 * UPDATE PROPERTY
 * PUT /api/properties/:idOrSlug
 * Access: Private (Seller only, and only owner/seller of property)
 */
export const updateProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'seller') {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Only sellers are authorized to update properties.',
      });
      return;
    }

    const idOrSlug = extractParamId(req.params.id);
    if (!idOrSlug) {
      res.status(400).json({
        success: false,
        message: 'Property ID or Slug is required.',
      });
      return;
    }

    // Check if property exists by ID or Slug
    const existingProperty = await prisma.property.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: { images: true },
    });

    if (!existingProperty) {
      res.status(404).json({
        success: false,
        message: 'Property not found.',
      });
      return;
    }

    // Check ownership: Seller can only update their own property
    if (existingProperty.sellerId !== user.id) {
      res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to update this property as you are not its seller.',
      });
      return;
    }

    const {
      title,
      slug: customSlug,
      description,
      features,
      price,
      propertyType,
      city,
      location,
      address,
      bedrooms,
      bathrooms,
      area,
      coverImage,
      status,
      images,
    } = req.body;

    // Build update data
    const updateData: any = {};

    if (title !== undefined && typeof title === 'string' && title.trim()) {
      updateData.title = title.trim();
    }
    if (customSlug !== undefined && typeof customSlug === 'string' && customSlug.trim()) {
      const cleanSlug = createSlugString(customSlug);
      if (cleanSlug && cleanSlug !== existingProperty.slug) {
        // Ensure new slug is unique
        const slugExists = await prisma.property.findUnique({
          where: { slug: cleanSlug },
          select: { id: true },
        });
        if (slugExists && slugExists.id !== existingProperty.id) {
          res.status(400).json({
            success: false,
            message: 'Provided slug is already in use. Please provide a unique slug.',
          });
          return;
        }
        updateData.slug = cleanSlug;
      }
    }
    if (description !== undefined && typeof description === 'string' && description.trim()) {
      updateData.description = description.trim();
    }
    if (propertyType !== undefined && typeof propertyType === 'string' && propertyType.trim()) {
      updateData.propertyType = propertyType.trim().toLowerCase();
    }
    if (price !== undefined && !isNaN(Number(price)) && Number(price) > 0) {
      updateData.price = Number(price);
    }
    if (city !== undefined && typeof city === 'string' && city.trim()) {
      updateData.city = city.trim();
    }
    if (location !== undefined && typeof location === 'string' && location.trim()) {
      updateData.location = location.trim();
    }
    if (address !== undefined) {
      updateData.address = typeof address === 'string' && address.trim() ? address.trim() : null;
    }
    if (bedrooms !== undefined && !isNaN(Number(bedrooms))) {
      updateData.bedrooms = Number(bedrooms);
    }
    if (bathrooms !== undefined && !isNaN(Number(bathrooms))) {
      updateData.bathrooms = Number(bathrooms);
    }
    if (area !== undefined && !isNaN(Number(area))) {
      updateData.area = Number(area);
    }
    if (coverImage !== undefined && typeof coverImage === 'string' && coverImage.trim()) {
      updateData.coverImage = await saveImageIfBase64(coverImage.trim(), user.id);
    }
    if (status !== undefined) {
      const allowedStatuses = ['active', 'inactive', 'sold'];
      if (allowedStatuses.includes(status)) {
        updateData.status = status;
      }
    }
    if (features !== undefined && Array.isArray(features)) {
      updateData.features = features.map((f: any) => String(f).trim()).filter(Boolean);
    }

    // If new images array provided, replace existing images
    if (images !== undefined && Array.isArray(images)) {
      await prisma.propertyImage.deleteMany({
        where: { propertyId: existingProperty.id },
      });

      const parsedImages = await Promise.all(
        images
          .filter((img: any) => img && typeof img.url === 'string' && img.url.trim())
          .map(async (img: any, idx: number) => ({
            propertyId: existingProperty.id,
            url: await saveImageIfBase64(img.url.trim(), user.id),
            caption: img.caption ? String(img.caption).trim() : null,
            sortOrder: typeof img.sortOrder === 'number' ? img.sortOrder : idx + 1,
          }))
      );

      if (parsedImages.length > 0) {
        await prisma.propertyImage.createMany({
          data: parsedImages,
        });
      }
    }

    // Execute update
    const updatedProperty = await prisma.property.update({
      where: { id: existingProperty.id },
      data: updateData,
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        seller: {
          select: sellerSelectFields,
        },
      },
    });

    logger.info(`Property updated successfully: ${existingProperty.id} by seller: ${user.id}`);

    res.status(200).json({
      success: true,
      message: 'Property updated successfully.',
      property: updatedProperty,
    });
  } catch (error: any) {
    logger.error('Error updating property:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating property.',
      error: error?.message,
    });
  }
};

/**
 * DELETE PROPERTY
 * DELETE /api/properties/:idOrSlug
 * Access: Private (Seller only, and only owner/seller of property)
 */
export const deleteProperty = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'seller') {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Only sellers are authorized to delete properties.',
      });
      return;
    }

    const idOrSlug = extractParamId(req.params.id);
    if (!idOrSlug) {
      res.status(400).json({
        success: false,
        message: 'Property ID or Slug is required.',
      });
      return;
    }

    // Check if property exists
    const existingProperty = await prisma.property.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });

    if (!existingProperty) {
      res.status(404).json({
        success: false,
        message: 'Property not found.',
      });
      return;
    }

    // Check ownership: Seller can only delete their own property
    if (existingProperty.sellerId !== user.id) {
      res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to delete this property as you are not its seller.',
      });
      return;
    }

    // Delete property (Cascade deletes related property_images)
    await prisma.property.delete({
      where: { id: existingProperty.id },
    });

    logger.info(`Property deleted successfully: ${existingProperty.id} by seller: ${user.id}`);

    res.status(200).json({
      success: true,
      message: 'Property deleted successfully.',
    });
  } catch (error: any) {
    logger.error('Error deleting property:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting property.',
      error: error?.message,
    });
  }
};

/**
 * GET PROPERTIES (Smart Listing API with Slug Filter)
 * GET /api/properties
 * Access: Public / Authenticated
 * 
 * Logic:
 * - If user is logged in as 'seller': returns ONLY that particular seller's properties (unless ?all=true is explicitly requested).
 * - If user is a 'buyer' or unauthenticated visitor: returns all properties (buyer side).
 * - Supports slug filter: ?slug=baner-luxury-penthouse
 */
export const getProperties = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    const {
      slug,
      city,
      propertyType,
      minPrice,
      maxPrice,
      bedrooms,
      bathrooms,
      searchQuery,
      search,
      status,
      sort,
      sellerId,
      all,
      page = '1',
      limit = '50',
    } = req.query;

    const whereClause: any = {};

    // 1. Slug Filter (exact or partial match)
    if (slug && typeof slug === 'string' && slug.trim()) {
      whereClause.slug = {
        equals: slug.trim().toLowerCase(),
        mode: 'insensitive',
      };
    }

    // 2. Role-based filtering:
    // If authenticated user is a SELLER (and has not explicitly queried ?all=true):
    // Show ONLY this particular seller's properties!
    if (user && user.role === 'seller' && all !== 'true') {
      whereClause.sellerId = user.id;
    } else if (sellerId && typeof sellerId === 'string') {
      // If a specific seller filter is passed
      whereClause.sellerId = sellerId;
    } else {
      // Buyer side / Public:
      // If status is not explicitly set in query, default to active properties for buyers
      if (!status || status === 'active') {
        whereClause.status = 'active';
      }
    }

    // Status filter if explicitly provided (e.g., 'all' to show all statuses for seller)
    if (status && status !== 'all') {
      whereClause.status = String(status);
    }

    // City filter (case-insensitive)
    if (city && typeof city === 'string' && city !== 'all') {
      whereClause.city = {
        equals: city.trim(),
        mode: 'insensitive',
      };
    }

    // Property Type filter (case-insensitive)
    if (propertyType && typeof propertyType === 'string' && propertyType !== 'all') {
      whereClause.propertyType = {
        equals: propertyType.trim().toLowerCase(),
        mode: 'insensitive',
      };
    }

    // Bedrooms filter
    if (bedrooms && !isNaN(Number(bedrooms))) {
      whereClause.bedrooms = {
        gte: Number(bedrooms),
      };
    }

    // Bathrooms filter
    if (bathrooms && !isNaN(Number(bathrooms))) {
      whereClause.bathrooms = {
        gte: Number(bathrooms),
      };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      whereClause.price = {};
      if (minPrice && !isNaN(Number(minPrice))) {
        whereClause.price.gte = Number(minPrice);
      }
      if (maxPrice && !isNaN(Number(maxPrice))) {
        whereClause.price.lte = Number(maxPrice);
      }
    }

    // Text search query across title, description, city, location, and slug
    const q = (searchQuery || search) as string | undefined;
    if (q && q.trim()) {
      const searchTerm = q.trim();
      whereClause.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { city: { contains: searchTerm, mode: 'insensitive' } },
        { location: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Sorting
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'price_asc' || sort === 'price-asc') {
      orderBy = { price: 'asc' };
    } else if (sort === 'price_desc' || sort === 'price-desc') {
      orderBy = { price: 'desc' };
    } else if (sort === 'area_desc' || sort === 'area') {
      orderBy = { area: 'desc' };
    } else if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Fetch total and results in parallel
    const [total, properties] = await Promise.all([
      prisma.property.count({ where: whereClause }),
      prisma.property.findMany({
        where: whereClause,
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          seller: {
            select: sellerSelectFields,
          },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
    ]);

    res.status(200).json({
      success: true,
      count: properties.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      viewMode: user && user.role === 'seller' && all !== 'true' ? 'seller_own_properties' : 'buyer_public_properties',
      properties,
    });
  } catch (error: any) {
    logger.error('Error fetching properties:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching properties.',
      error: error?.message,
    });
  }
};

/**
 * GET MY PROPERTIES
 * GET /api/properties/seller/my-properties
 * Access: Private (Seller only)
 * 
 * Returns all properties owned by the authenticated seller with statistics
 */
export const getMyProperties = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'seller') {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Only sellers can access their own property dashboard.',
      });
      return;
    }

    const properties = await prisma.property.findMany({
      where: { sellerId: user.id },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        seller: {
          select: sellerSelectFields,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: properties.length,
      active: properties.filter((p) => p.status === 'active').length,
      sold: properties.filter((p) => p.status === 'sold').length,
      inactive: properties.filter((p) => p.status === 'inactive').length,
    };

    res.status(200).json({
      success: true,
      stats,
      count: properties.length,
      properties,
    });
  } catch (error: any) {
    logger.error('Error fetching seller properties:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching your properties.',
      error: error?.message,
    });
  }
};

/**
 * GET PROPERTY BY ID OR SLUG
 * GET /api/properties/:idOrSlug
 * Access: Public (Buyers, Sellers, Guests)
 */
export const getPropertyById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const idOrSlug = extractParamId(req.params.id);
    if (!idOrSlug) {
      res.status(400).json({
        success: false,
        message: 'Property ID or Slug is required.',
      });
      return;
    }

    const property = await prisma.property.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug },
        ],
      },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        seller: {
          select: sellerSelectFields,
        },
      },
    });

    if (!property) {
      res.status(404).json({
        success: false,
        message: 'Property not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      property,
    });
  } catch (error: any) {
    logger.error('Error fetching property by id or slug:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching property.',
      error: error?.message,
    });
  }
};

/**
 * UPLOAD PROPERTY IMAGE
 * POST /api/properties/upload-image
 * Access: Private (Seller only)
 */
export const uploadPropertyImage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== 'seller') {
      res.status(403).json({
        success: false,
        message: 'Forbidden. Only sellers can upload property images.',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Please provide an image file to upload.',
      });
      return;
    }

    const imageUrl = await processAndSavePropertyImage(req.file.buffer, user.id);

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully.',
      imageUrl,
    });
  } catch (error: any) {
    logger.error('Error uploading property image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process property image.',
      error: error?.message,
    });
  }
};
