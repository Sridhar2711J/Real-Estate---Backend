import { Router } from 'express';
import {
  addBookmark,
  removeBookmark,
} from '../controllers/bookmark.controller';
import { authenticateToken, requireBuyer } from '../middleware/authenticate';

const router = Router();

/**
 * All bookmark endpoints require authentication and buyer role only
 */
router.use(authenticateToken, requireBuyer);

/**
 * @swagger
 * tags:
 *   name: Bookmarks
 *   description: Buyer property bookmarks management (ADD, REMOVE)
 */

/**
 * @swagger
 * /api/bookmarks:
 *   post:
 *     summary: Add a property to buyer bookmarks
 *     tags: [Bookmarks]
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
 *             properties:
 *               propertyId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Property bookmarked successfully
 *       400:
 *         description: Bad request or already bookmarked
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Buyer role only)
 *       404:
 *         description: Property not found
 */
router.post('/', addBookmark);

/**
 * @swagger
 * /api/bookmarks/{id}:
 *   delete:
 *     summary: Remove a bookmark by Bookmark ID or Property ID
 *     tags: [Bookmarks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Bookmark ID or Property ID
 *     responses:
 *       200:
 *         description: Bookmark removed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Buyer role only)
 *       404:
 *         description: Bookmark not found
 */
router.delete('/:id', removeBookmark);

export default router;
