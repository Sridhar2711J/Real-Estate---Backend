import { Router } from 'express';
import {
  registerUser,
  loginUser,
  refreshTokenHandler,
  logoutUser,
  getMe,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/user.controller';
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
 * @desc    Authenticate user, get access & refresh tokens
 * @access  Public
 */
router.post('/login', loginUser);

/**
 * @route   POST /api/users/refresh-token
 * @desc    Obtain a fresh access token using refresh token
 * @access  Public
 */
router.post('/refresh-token', refreshTokenHandler);

/**
 * @route   POST /api/users/logout
 * @desc    Invalidate refresh token and session
 * @access  Public (Optionally Authenticated)
 */
router.post('/logout', logoutUser);

/**
 * @route   GET /api/users/me
 * @desc    Get currently authenticated user data
 * @access  Private (Requires Bearer Token)
 */
router.get('/me', authenticateToken, getMe);

/**
 * @route   POST /api/users/forgot-password
 * @desc    Initiate password reset, send 6-digit OTP via email
 * @access  Public
 */
router.post('/forgot-password', forgotPassword);

/**
 * @route   POST /api/users/verify-otp
 * @desc    Validate 6-digit OTP code
 * @access  Public
 */
router.post('/verify-otp', verifyOtp);

/**
 * @route   POST /api/users/reset-password
 * @desc    Update password with valid OTP
 * @access  Public
 */
router.post('/reset-password', resetPassword);

export default router;
