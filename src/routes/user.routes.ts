import { Router } from 'express';
import { registerUser, loginUser, getMe } from '../controllers/user.controller';
import { authenticateToken } from '../middleware/authenticate';

const router = Router();

/**
 * @route   POST /api/users/register
 * @desc    Register a new user (buyer or seller)
 * @access  Public
 */
router.post('/register', registerUser);

/**
 * @route   POST /api/users/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', loginUser);

/**
 * @route   GET /api/users/me
 * @desc    Get currently authenticated user data
 * @access  Private (Requires Bearer Token)
 */
router.get('/me', authenticateToken, getMe);

export default router;
