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
 * Enriches property with listingType ('rent' or 'sale')
 */
const enrichPropertyWithListingType = (property: any) => {
  if (!property) return property;
  const isRent = /for rent|rental|\brent\b/i.test(property.title || '');
  return {
    ...property,
    listingType: (property.listingType || (isRent ? 'rent' : 'sale')) as 'rent' | 'sale',
  };
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
      listingType,
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
    if (!title || !String(title).trim()) {
      res.status(400).json({
        success: false,
        message: 'Title is required.',
      });
      return;
    }

    if (!propertyType || !String(propertyType).trim()) {
      res.status(400).json({
        success: false,
        message: 'Property type is required.',
      });
      return;
    }

    // Price validation: only check that price is provided (!empty)
    if (price === undefined || price === null || String(price).trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Price is required.',
      });
      return;
    }

    // Area validation: only check that area is provided (!empty)
    if (area === undefined || area === null || String(area).trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Area is required.',
      });
      return;
    }

    if (!city || !String(city).trim()) {
      res.status(400).json({
        success: false,
        message: 'City is required.',
      });
      return;
    }

    if (!location || !String(location).trim()) {
      res.status(400).json({
        success: false,
        message: 'Location is required.',
      });
      return;
    }

    if (!description || !String(description).trim()) {
      res.status(400).json({
        success: false,
        message: 'Description is required.',
      });
      return;
    }

    // Process uploaded files from Multer
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const coverFile = files?.['coverImage']?.[0];
    let finalCoverImage = '';

    if (coverFile && coverFile.buffer) {
      finalCoverImage = await processAndSavePropertyImage(coverFile.buffer, user.id);
    } else if (coverImage && typeof coverImage === 'string' && coverImage.trim()) {
      finalCoverImage = await saveImageIfBase64(coverImage.trim(), user.id);
    }

    if (!finalCoverImage) {
      res.status(400).json({
        success: false,
        message: 'Cover image is required. Please upload an image file.',
      });
      return;
    }

    // Generate unique slug
    const finalSlug = await generateUniqueSlug(title, customSlug);

    // Parse features (supports array or JSON string from FormData)
    let parsedFeatures: string[] = [];
    if (typeof features === 'string') {
      try {
        parsedFeatures = JSON.parse(features);
      } catch {
        parsedFeatures = features.split(',').map((f) => f.trim()).filter(Boolean);
      }
    } else if (Array.isArray(features)) {
      parsedFeatures = features.map((f: any) => String(f).trim()).filter(Boolean);
    }

    // Parse gallery images (handles uploaded files and/or metadata JSON)
    const galleryFiles = files?.['images'] || [];
    let imagesMetadata: any[] = [];
    if (typeof req.body.imagesMetadata === 'string') {
      try {
        imagesMetadata = JSON.parse(req.body.imagesMetadata);
      } catch {
        imagesMetadata = [];
      }
    } else if (Array.isArray(req.body.imagesMetadata)) {
      imagesMetadata = req.body.imagesMetadata;
    }

    const parsedImages: { url: string; caption?: string | null; sortOrder: number }[] = [];

    // Save newly uploaded gallery files
    for (let i = 0; i < galleryFiles.length; i++) {
      const gFile = galleryFiles[i];
      if (gFile && gFile.buffer) {
        const savedUrl = await processAndSavePropertyImage(gFile.buffer, user.id);
        const meta = imagesMetadata[i] || {};
        parsedImages.push({
          url: savedUrl,
          caption: meta.caption ? String(meta.caption).trim() : null,
          sortOrder: typeof meta.sortOrder === 'number' ? meta.sortOrder : i + 1,
        });
      }
    }

    // Also support any existing images array if passed as JSON
    let rawImages = images || req.body.images;
    if (typeof rawImages === 'string') {
      try {
        rawImages = JSON.parse(rawImages);
      } catch {
        rawImages = [];
      }
    }
    if (Array.isArray(rawImages)) {
      for (const img of rawImages) {
        if (img && typeof img.url === 'string' && img.url.trim()) {
          const processedUrl = await saveImageIfBase64(img.url.trim(), user.id);
          parsedImages.push({
            url: processedUrl,
            caption: img.caption ? String(img.caption).trim() : null,
            sortOrder: typeof img.sortOrder === 'number' ? img.sortOrder : parsedImages.length + 1,
          });
        }
      }
    }

    // Valid status values
    const allowedStatuses = ['active', 'inactive', 'sold'];
    const finalStatus = allowedStatuses.includes(status) ? status : 'active';

    // Create in Database with sellerId and unique slug
    const newProperty = await prisma.property.create({
      data: {
        title: String(title).trim(),
        slug: finalSlug,
        description: String(description).trim(),
        features: parsedFeatures,
        price: Number(price) || 0,
        propertyType: String(propertyType).trim().toLowerCase(),
        city: String(city).trim(),
        location: String(location).trim(),
        address: address && typeof address === 'string' && address.trim() ? address.trim() : null,
        bedrooms: bedrooms !== undefined && !isNaN(Number(bedrooms)) ? Number(bedrooms) : 0,
        bathrooms: bathrooms !== undefined && !isNaN(Number(bathrooms)) ? Number(bathrooms) : 0,
        area: Number(area) || 0,
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
      property: enrichPropertyWithListingType(newProperty),
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
      listingType,
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
    // Price validation: only check that price is provided (!empty)
    if (price !== undefined && price !== null && String(price).trim() !== '') {
      updateData.price = Number(price) || 0;
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
    // Area validation: only check that area is provided (!empty)
    if (area !== undefined && area !== null && String(area).trim() !== '') {
      updateData.area = Number(area) || 0;
    }

    // Process cover image (uploaded file or string URL)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const coverFile = files?.['coverImage']?.[0];
    if (coverFile && coverFile.buffer) {
      updateData.coverImage = await processAndSavePropertyImage(coverFile.buffer, user.id);
    } else if (coverImage !== undefined && typeof coverImage === 'string' && coverImage.trim()) {
      updateData.coverImage = await saveImageIfBase64(coverImage.trim(), user.id);
    }

    if (status !== undefined) {
      const allowedStatuses = ['active', 'inactive', 'sold'];
      if (allowedStatuses.includes(status)) {
        updateData.status = status;
      }
    }
    if (features !== undefined) {
      let parsedFeatures: string[] = [];
      if (typeof features === 'string') {
        try {
          parsedFeatures = JSON.parse(features);
        } catch {
          parsedFeatures = features.split(',').map((f) => f.trim()).filter(Boolean);
        }
      } else if (Array.isArray(features)) {
        parsedFeatures = features.map((f: any) => String(f).trim()).filter(Boolean);
      }
      updateData.features = parsedFeatures;
    }

    // Process gallery images (handles uploaded files and/or existing images)
    const galleryFiles = files?.['images'] || [];
    let imagesMetadata: any[] = [];
    if (typeof req.body.imagesMetadata === 'string') {
      try {
        imagesMetadata = JSON.parse(req.body.imagesMetadata);
      } catch {
        imagesMetadata = [];
      }
    } else if (Array.isArray(req.body.imagesMetadata)) {
      imagesMetadata = req.body.imagesMetadata;
    }

    let existingImagesList: any[] = [];
    if (typeof req.body.existingImages === 'string') {
      try {
        existingImagesList = JSON.parse(req.body.existingImages);
      } catch {
        existingImagesList = [];
      }
    } else if (Array.isArray(req.body.existingImages)) {
      existingImagesList = req.body.existingImages;
    } else if (images) {
      if (typeof images === 'string') {
        try {
          existingImagesList = JSON.parse(images);
        } catch {
          existingImagesList = [];
        }
      } else if (Array.isArray(images)) {
        existingImagesList = images;
      }
    }

    // If new files or existing images specified, rebuild property images
    if (galleryFiles.length > 0 || req.body.existingImages !== undefined || images !== undefined) {
      await prisma.propertyImage.deleteMany({
        where: { propertyId: existingProperty.id },
      });

      const parsedImages: { propertyId: string; url: string; caption?: string | null; sortOrder: number }[] = [];

      // Existing images kept
      for (const img of existingImagesList) {
        if (img && typeof img.url === 'string' && img.url.trim()) {
          parsedImages.push({
            propertyId: existingProperty.id,
            url: img.url.trim(),
            caption: img.caption ? String(img.caption).trim() : null,
            sortOrder: typeof img.sortOrder === 'number' ? img.sortOrder : parsedImages.length + 1,
          });
        }
      }

      // Newly uploaded gallery files
      for (let i = 0; i < galleryFiles.length; i++) {
        const gFile = galleryFiles[i];
        if (gFile && gFile.buffer) {
          const savedUrl = await processAndSavePropertyImage(gFile.buffer, user.id);
          const meta = imagesMetadata[i] || {};
          parsedImages.push({
            propertyId: existingProperty.id,
            url: savedUrl,
            caption: meta.caption ? String(meta.caption).trim() : null,
            sortOrder: typeof meta.sortOrder === 'number' ? meta.sortOrder : parsedImages.length + 1,
          });
        }
      }

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
      property: enrichPropertyWithListingType(updatedProperty),
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
      ids,
      slug,
      city,
      propertyType,
      listingType,
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

    // Specific IDs filter (e.g. for saved / bookmarked properties)
    if (ids && typeof ids === 'string' && ids.trim()) {
      const idList = ids.split(',').map((id) => id.trim()).filter(Boolean);
      whereClause.id = { in: idList };
    }

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

    // City filter (case-insensitive substring or match)
    if (city && typeof city === 'string' && city !== 'all' && city.trim()) {
      whereClause.city = {
        contains: city.trim(),
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

    // Listing Type (Sale vs Rent) filter
    if (listingType && typeof listingType === 'string' && listingType !== 'all') {
      const cleanType = listingType.trim().toLowerCase();
      if (cleanType === 'rent') {
        whereClause.title = { contains: 'rent', mode: 'insensitive' };
      } else if (cleanType === 'sale') {
        whereClause.NOT = [
          { title: { contains: 'rent', mode: 'insensitive' } },
        ];
      }
    }

    // Bedrooms filter (1, 2, 3 BHK exact match, 4+ BHK gte)
    if (bedrooms && !isNaN(Number(bedrooms))) {
      const bedNum = Number(bedrooms);
      if (bedNum >= 4) {
        whereClause.bedrooms = {
          gte: 4,
        };
      } else {
        whereClause.bedrooms = {
          equals: bedNum,
        };
      }
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

    // Fetch total and results in parallel, along with unique cities & property types for filter options
    const [total, properties, allSummary] = await Promise.all([
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
      prisma.property.findMany({
        where: user && user.role === 'seller' && all !== 'true' ? { sellerId: user.id } : { status: 'active' },
        select: {
          city: true,
          propertyType: true,
        },
      }),
    ]);

    const uniqueCities = Array.from(
      new Set(allSummary.map((p) => p.city).filter(Boolean))
    );

    const uniquePropertyTypes = Array.from(
      new Set(allSummary.map((p) => p.propertyType).filter(Boolean))
    );

    res.status(200).json({
      success: true,
      count: properties.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      viewMode: user && user.role === 'seller' && all !== 'true' ? 'seller_own_properties' : 'buyer_public_properties',
      cities: uniqueCities,
      propertyTypes: uniquePropertyTypes,
      properties: properties.map(enrichPropertyWithListingType),
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

    const {
      slug,
      city,
      propertyType,
      status,
      search,
      searchQuery,
      sort,
      page = '1',
      limit = '5',
    } = req.query;

    // Get overall seller statistics & cities and property types across all properties
    const allSellerProperties = await prisma.property.findMany({
      where: { sellerId: user.id },
      select: {
        id: true,
        status: true,
        city: true,
        propertyType: true,
      },
    });

    const stats = {
      total: allSellerProperties.length,
      active: allSellerProperties.filter((p) => (p.status || 'active') === 'active').length,
      sold: allSellerProperties.filter((p) => p.status === 'sold').length,
      inactive: allSellerProperties.filter((p) => p.status === 'inactive').length,
    };

    const uniqueCities = Array.from(
      new Set(allSellerProperties.map((p) => p.city).filter(Boolean))
    );

    const uniquePropertyTypes = Array.from(
      new Set(allSellerProperties.map((p) => p.propertyType).filter(Boolean))
    );

    // Build filter where clause
    const whereClause: any = {
      sellerId: user.id,
    };

    // Slug Filter (exact or partial match)
    if (slug && typeof slug === 'string' && slug.trim()) {
      whereClause.slug = {
        contains: slug.trim(),
        mode: 'insensitive',
      };
    }

    // Status Filter (active / inactive / sold)
    if (status && status !== 'all' && typeof status === 'string') {
      whereClause.status = status.trim();
    }

    // City Filter
    if (city && city !== 'all' && typeof city === 'string' && city.trim()) {
      whereClause.city = {
        equals: city.trim(),
        mode: 'insensitive',
      };
    }

    // Property Type Filter
    if (propertyType && propertyType !== 'all' && typeof propertyType === 'string' && propertyType.trim()) {
      whereClause.propertyType = {
        equals: propertyType.trim().toLowerCase(),
        mode: 'insensitive',
      };
    }

    // Text search filter across title, slug, description, city, and location
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
    if (sort === 'price-asc' || sort === 'price_asc') {
      orderBy = { price: 'asc' };
    } else if (sort === 'price-desc' || sort === 'price_desc') {
      orderBy = { price: 'desc' };
    } else if (sort === 'area' || sort === 'area_desc') {
      orderBy = { area: 'desc' };
    } else if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 5));
    const skip = (pageNum - 1) * limitNum;

    // Parallel fetch for total count matching filters and paginated properties
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
      stats,
      cities: uniqueCities,
      propertyTypes: uniquePropertyTypes,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      page: pageNum,
      limit: limitNum,
      count: properties.length,
      properties: properties.map(enrichPropertyWithListingType),
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
      property: enrichPropertyWithListingType(property),
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
