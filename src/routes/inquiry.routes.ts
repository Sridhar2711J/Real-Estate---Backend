import { Router } from 'express';
import {
  createInquiry,
  getInquiries,
  getInquiryCounts,
  getInquiryById,
  updateInquiryStatus,
  deleteInquiry,
} from '../controllers/inquiry.controller';
import {
  authenticateToken,
  optionalAuthenticateToken,
  requireSeller,
} from '../middleware/authenticate';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Inquiries
 *   description: Property inquiry & tour request management (Buyer & Seller)
 */

/**
 * @swagger
 * /api/inquiries:
 *   post:
 *     summary: Submit an inquiry on a property
 *     tags: [Inquiries]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - name
 *               - email
 *               - message
 *             properties:
 *               propertyId:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               message:
 *                 type: string
 *               honeypotWebsite:
 *                 type: string
 *     responses:
 *       201:
 *         description: Inquiry submitted successfully
 *       400:
 *         description: Bad request or validation failure
 */
router.post('/', optionalAuthenticateToken, createInquiry);

/**
 * @swagger
 * /api/inquiries/count:
 *   get:
 *     summary: Get fast count of inquiries and unread count for sidebar badge
 *     tags: [Inquiries]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Counts retrieved successfully
 */
router.get('/count', authenticateToken, getInquiryCounts);

/**
 * @swagger
 * /api/inquiries:
 *   get:
 *     summary: Get paginated inquiries with backend search and filtering
 *     tags: [Inquiries]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, new, read, replied]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inquiries retrieved successfully
 */
router.get('/', authenticateToken, getInquiries);

/**
 * @swagger
 * /api/inquiries/{id}:
 *   get:
 *     summary: Get single inquiry by ID
 *     tags: [Inquiries]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inquiry details
 *       404:
 *         description: Inquiry not found
 */
router.get('/:id', authenticateToken, getInquiryById);

/**
 * @swagger
 * /api/inquiries/{id}/status:
 *   patch:
 *     summary: Update inquiry status or reply (Seller only)
 *     tags: [Inquiries]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [new, read, replied]
 *               replyMessage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inquiry updated successfully
 */
router.patch('/:id/status', authenticateToken, requireSeller, updateInquiryStatus);

/**
 * @swagger
 * /api/inquiries/{id}:
 *   delete:
 *     summary: Delete inquiry
 *     tags: [Inquiries]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inquiry deleted successfully
 */
router.delete('/:id', authenticateToken, deleteInquiry);

export default router;

