import { Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/authenticate';

/**
 * Standard property selection for inquiry relations
 */
const propertySelectFields = {
  id: true,
  slug: true,
  title: true,
  city: true,
  location: true,
  price: true,
  coverImage: true,
  sellerId: true,
  status: true,
  bedrooms: true,
  bathrooms: true,
  area: true,
  propertyType: true,
};

/**
 * Standard sender selection
 */
const senderSelectFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
};

/**
 * Format inquiry for client with flat property helper fields
 */
const formatInquiry = (inquiry: any) => {
  return {
    ...inquiry,
    propertyTitle: inquiry.property?.title || inquiry.propertyTitle || 'Property Inquiry',
    propertySlug: inquiry.property?.slug || inquiry.propertySlug || inquiry.propertyId,
    propertyCity: inquiry.property?.city || inquiry.propertyCity || '',
    propertyCoverImage: inquiry.property?.coverImage || inquiry.propertyCoverImage || null,
  };
};

/**
 * 1. CREATE INQUIRY
 * @desc    Submit an inquiry on a property
 * @route   POST /api/inquiries
 * @access  Public / Authenticated (optional token for buyer tracking)
 */
export const createInquiry = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      propertyId,
      name,
      email,
      phone,
      message,
      honeypotWebsite,
    } = req.body;

    // Honeypot spam check
    if (honeypotWebsite) {
      res.status(400).json({
        success: false,
        message: 'Spam detected. Submission blocked.',
      });
      return;
    }

    if (!propertyId || typeof propertyId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Valid propertyId is required.',
      });
      return;
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Name is required.',
      });
      return;
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
      return;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        success: false,
        message: 'Message is required.',
      });
      return;
    }

    // Verify property exists
    const property = await prisma.property.findFirst({
      where: {
        OR: [
          { id: propertyId },
          { slug: propertyId },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        city: true,
        coverImage: true,
        sellerId: true,
      },
    });

    if (!property) {
      res.status(404).json({
        success: false,
        message: 'Property not found.',
      });
      return;
    }

    // Prevent seller from inquiring on their own property
    if (req.user && req.user.id === property.sellerId) {
      res.status(400).json({
        success: false,
        message: 'You cannot send an inquiry for your own property listing.',
      });
      return;
    }

    const senderId = req.user ? req.user.id : null;

    const newInquiry = await prisma.inquiry.create({
      data: {
        propertyId: property.id,
        senderId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone && typeof phone === 'string' ? phone.trim() : '',
        message: message.trim(),
        status: 'new',
      },
      include: {
        property: {
          select: propertySelectFields,
        },
        sender: {
          select: senderSelectFields,
        },
      },
    });

    logger.info(`New inquiry created: ${newInquiry.id} on property ${property.id}`);

    res.status(201).json({
      success: true,
      message: 'Your inquiry has been submitted successfully! The seller will contact you shortly.',
      inquiry: formatInquiry(newInquiry),
    });
  } catch (error: any) {
    logger.error('Error creating inquiry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit inquiry.',
      error: error?.message,
    });
  }
};

/**
 * 2. GET INQUIRIES (Role-based: Seller vs Buyer with Search, Filter & Pagination)
 * @desc    Get paginated inquiries with backend search and filtering
 * @route   GET /api/inquiries
 * @access  Private (Buyer or Seller)
 */
export const getInquiries = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const {
      status,
      search,
      searchQuery,
      propertyId,
      page = '1',
      limit = '10',
    } = req.query;

    const parsedPage = Math.max(1, parseInt(String(page), 10) || 1);
    const parsedLimit = Math.max(1, parseInt(String(limit), 10) || 10);
    const skip = (parsedPage - 1) * parsedLimit;

    // Base scoping condition depending on user role
    let baseScope: any = {};

    if (user.role === 'seller') {
      // Seller sees inquiries for their properties
      baseScope.property = {
        sellerId: user.id,
      };

      if (propertyId && typeof propertyId === 'string' && propertyId.trim()) {
        baseScope.propertyId = propertyId.trim();
      }
    } else {
      // Buyer sees inquiries they sent (by senderId or email)
      baseScope.OR = [
        { senderId: user.id },
        { email: { equals: user.email.toLowerCase(), mode: 'insensitive' } },
      ];
    }

    // Build main where clause combining baseScope, status, and search
    const whereClause: any = { ...baseScope };

    // Status filter ('all', 'new', 'read', 'replied')
    if (status && typeof status === 'string' && status !== 'all') {
      whereClause.status = status.trim().toLowerCase();
    }

    // Backend text search
    const q = (searchQuery || search) as string | undefined;
    if (q && q.trim()) {
      const searchTerm = q.trim();

      const searchConditions: any[] = [
        { message: { contains: searchTerm, mode: 'insensitive' } },
        { replyMessage: { contains: searchTerm, mode: 'insensitive' } },
        { property: { title: { contains: searchTerm, mode: 'insensitive' } } },
        { property: { city: { contains: searchTerm, mode: 'insensitive' } } },
        { property: { location: { contains: searchTerm, mode: 'insensitive' } } },
      ];

      if (user.role === 'seller') {
        // Seller can also search by buyer's name, email, phone
        searchConditions.push(
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { phone: { contains: searchTerm, mode: 'insensitive' } }
        );
      }

      if (whereClause.OR) {
        // When baseScope already uses OR (buyer), wrap with AND
        whereClause.AND = [
          { OR: whereClause.OR },
          { OR: searchConditions },
        ];
        delete whereClause.OR;
      } else {
        whereClause.OR = searchConditions;
      }
    }

    // Execute queries in parallel: inquiries, total filtered count, and status counts
    const [rawInquiries, total, countNew, countRead, countReplied, countAll] = await Promise.all([
      prisma.inquiry.findMany({
        where: whereClause,
        include: {
          property: {
            select: propertySelectFields,
          },
          sender: {
            select: senderSelectFields,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: parsedLimit,
      }),
      prisma.inquiry.count({ where: whereClause }),
      prisma.inquiry.count({ where: { ...baseScope, status: 'new' } }),
      prisma.inquiry.count({ where: { ...baseScope, status: 'read' } }),
      prisma.inquiry.count({ where: { ...baseScope, status: 'replied' } }),
      prisma.inquiry.count({ where: baseScope }),
    ]);

    const totalPages = Math.ceil(total / parsedLimit) || 1;
    const formattedInquiries = rawInquiries.map(formatInquiry);

    // Unread count:
    // For seller: new inquiries awaiting action
    // For buyer: replied inquiries that buyer hasn't seen yet or active count
    const unreadCount = user.role === 'seller' ? countNew : countReplied;

    res.status(200).json({
      success: true,
      inquiries: formattedInquiries,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
      },
      counts: {
        all: countAll,
        new: countNew,
        read: countRead,
        replied: countReplied,
        unread: unreadCount,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching inquiries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiries.',
      error: error?.message,
    });
  }
};

/**
 * 3. GET INQUIRY COUNTS (Fast endpoint for sidebar & navbar badges)
 * @desc    Get inquiry counts for current user
 * @route   GET /api/inquiries/count
 * @access  Private (Buyer or Seller)
 */
export const getInquiryCounts = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    let baseScope: any = {};
    if (user.role === 'seller') {
      baseScope.property = {
        sellerId: user.id,
      };
    } else {
      baseScope.OR = [
        { senderId: user.id },
        { email: { equals: user.email.toLowerCase(), mode: 'insensitive' } },
      ];
    }

    const [total, countNew, countReplied] = await Promise.all([
      prisma.inquiry.count({ where: baseScope }),
      prisma.inquiry.count({ where: { ...baseScope, status: 'new' } }),
      prisma.inquiry.count({ where: { ...baseScope, status: 'replied' } }),
    ]);

    const unread = user.role === 'seller' ? countNew : countReplied;

    res.status(200).json({
      success: true,
      total,
      unread,
      countNew,
      countReplied,
    });
  } catch (error: any) {
    logger.error('Error fetching inquiry counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiry counts.',
      error: error?.message,
    });
  }
};

/**
 * 4. GET INQUIRY BY ID
 * @desc    Get single inquiry details
 * @route   GET /api/inquiries/:id
 * @access  Private (Seller owner or Buyer sender)
 */
export const getInquiryById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!targetId) {
      res.status(400).json({
        success: false,
        message: 'Inquiry ID is required.',
      });
      return;
    }

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: targetId },
      include: {
        property: {
          select: propertySelectFields,
        },
        sender: {
          select: senderSelectFields,
        },
      },
    });

    if (!inquiry) {
      res.status(404).json({
        success: false,
        message: 'Inquiry not found.',
      });
      return;
    }

    // Authorization: User must be seller of the property or the buyer sender
    const isSeller = user.role === 'seller' && inquiry.property.sellerId === user.id;
    const isBuyer =
      user.role === 'buyer' &&
      (inquiry.senderId === user.id || inquiry.email.toLowerCase() === user.email.toLowerCase());

    if (!isSeller && !isBuyer) {
      res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to view this inquiry.',
      });
      return;
    }

    // Auto mark as 'read' if viewed by seller and currently 'new'
    if (isSeller && inquiry.status === 'new') {
      const updated = await prisma.inquiry.update({
        where: { id: inquiry.id },
        data: { status: 'read' },
        include: {
          property: {
            select: propertySelectFields,
          },
          sender: {
            select: senderSelectFields,
          },
        },
      });
      res.status(200).json({
        success: true,
        inquiry: formatInquiry(updated),
      });
      return;
    }

    res.status(200).json({
      success: true,
      inquiry: formatInquiry(inquiry),
    });
  } catch (error: any) {
    logger.error('Error fetching inquiry by id:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inquiry.',
      error: error?.message,
    });
  }
};

/**
 * 5. UPDATE INQUIRY STATUS & REPLY
 * @desc    Update inquiry status or send seller reply
 * @route   PATCH /api/inquiries/:id/status
 * @access  Private (Seller owner only)
 */
export const updateInquiryStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!targetId) {
      res.status(400).json({
        success: false,
        message: 'Inquiry ID is required.',
      });
      return;
    }

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: targetId },
      include: {
        property: {
          select: { sellerId: true },
        },
      },
    });

    if (!inquiry) {
      res.status(404).json({
        success: false,
        message: 'Inquiry not found.',
      });
      return;
    }

    // Verify ownership
    if (inquiry.property.sellerId !== user.id) {
      res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to update this inquiry.',
      });
      return;
    }

    const { status, replyMessage } = req.body;

    const updateData: any = {};

    if (status && ['new', 'read', 'replied'].includes(status)) {
      updateData.status = status;
    }

    if (replyMessage !== undefined && typeof replyMessage === 'string') {
      updateData.replyMessage = replyMessage.trim();
      updateData.repliedAt = new Date();
      updateData.status = 'replied';
    }

    const updatedInquiry = await prisma.inquiry.update({
      where: { id: targetId },
      data: updateData,
      include: {
        property: {
          select: propertySelectFields,
        },
        sender: {
          select: senderSelectFields,
        },
      },
    });

    logger.info(`Inquiry ${targetId} updated to status ${updatedInquiry.status} by seller ${user.id}`);

    res.status(200).json({
      success: true,
      message: replyMessage ? 'Reply sent successfully.' : 'Inquiry status updated successfully.',
      inquiry: formatInquiry(updatedInquiry),
    });
  } catch (error: any) {
    logger.error('Error updating inquiry status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inquiry status.',
      error: error?.message,
    });
  }
};

/**
 * 6. DELETE INQUIRY
 * @desc    Delete inquiry
 * @route   DELETE /api/inquiries/:id
 * @access  Private (Seller owner or Buyer sender)
 */
export const deleteInquiry = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
      });
      return;
    }

    const targetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!targetId) {
      res.status(400).json({
        success: false,
        message: 'Inquiry ID is required.',
      });
      return;
    }

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: targetId },
      include: {
        property: {
          select: { sellerId: true },
        },
      },
    });

    if (!inquiry) {
      res.status(404).json({
        success: false,
        message: 'Inquiry not found.',
      });
      return;
    }

    const isSeller = user.role === 'seller' && inquiry.property.sellerId === user.id;
    const isBuyer =
      user.role === 'buyer' &&
      (inquiry.senderId === user.id || inquiry.email.toLowerCase() === user.email.toLowerCase());

    if (!isSeller && !isBuyer) {
      res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to delete this inquiry.',
      });
      return;
    }

    await prisma.inquiry.delete({
      where: { id: targetId },
    });

    logger.info(`Inquiry ${targetId} deleted by user ${user.id}`);

    res.status(200).json({
      success: true,
      message: 'Inquiry deleted successfully.',
    });
  } catch (error: any) {
    logger.error('Error deleting inquiry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete inquiry.',
      error: error?.message,
    });
  }
};

