import { Router } from 'express';
import {
  createProperty,
  updateProperty,
  deleteProperty,
  getProperties,
  getMyProperties,
  getPropertyById,
  uploadPropertyImage,
} from '../controllers/property.controller';
import {
  authenticateToken,
  requireSeller,
  optionalAuthenticateToken,
} from '../middleware/authenticate';
import { handlePropertyImageUpload } from '../middleware/upload';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Properties
 *   description: Property listings and management endpoints
 */

/**
 * @swagger
 * /api/properties:
 *   get:
 *     summary: Retrieve properties list
 *     description: >
 *       Intelligent endpoint:
 *       - If requester is an authenticated seller, only that particular seller's properties are returned.
 *       - If requester is a buyer or unauthenticated guest, all active public properties are returned.
 *     tags: [Properties]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: slug
 *         description: Filter property by exact or partial slug
 *         schema:
 *           type: string
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *       - in: query
 *         name: propertyType
 *         schema:
 *           type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: bedrooms
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, sold, all]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, price_asc, price_desc, area_desc]
 *     responses:
 *       200:
 *         description: List of properties
 */
router.get('/', optionalAuthenticateToken, getProperties);

/**
 * @swagger
 * /api/properties/seller/my-properties:
 *   get:
 *     summary: Get currently authenticated seller's properties with stats
 *     tags: [Properties]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Seller property dashboard list and counts
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not a seller)
 */
router.get('/seller/my-properties', authenticateToken, requireSeller, getMyProperties);

/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Create a new property listing (Seller only)
 *     tags: [Properties]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePropertyInput'
 *     responses:
 *       201:
 *         description: Property successfully created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Requires seller role)
 */
router.post('/', authenticateToken, requireSeller, createProperty);

/**
 * @swagger
 * /api/properties/upload-image:
 *   post:
 *     summary: Upload and optimize a property image (WebP)
 *     tags: [Properties]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Uploaded image URL
 *       400:
 *         description: Invalid file
 *       403:
 *         description: Forbidden
 */
router.post(
  '/upload-image',
  authenticateToken,
  requireSeller,
  handlePropertyImageUpload,
  uploadPropertyImage
);

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get single property by ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property details
 *       404:
 *         description: Property not found
 */
router.get('/:id', optionalAuthenticateToken, getPropertyById);

/**
 * @swagger
 * /api/properties/{id}:
 *   put:
 *     summary: Update a property listing (Only owner seller can update)
 *     tags: [Properties]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePropertyInput'
 *     responses:
 *       200:
 *         description: Property successfully updated
 *       403:
 *         description: Forbidden (Only owner seller can update)
 *       404:
 *         description: Property not found
 */
router.put('/:id', authenticateToken, requireSeller, updateProperty);

/**
 * @swagger
 * /api/properties/{id}:
 *   delete:
 *     summary: Delete a property listing (Only owner seller can delete)
 *     tags: [Properties]
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
 *         description: Property successfully deleted
 *       403:
 *         description: Forbidden (Only owner seller can delete)
 *       404:
 *         description: Property not found
 */
router.delete('/:id', authenticateToken, requireSeller, deleteProperty);

export default router;
