import { Router } from 'express';
import {
  registerUser,
  loginUser,
  refreshTokenHandler,
  logoutUser,
  getMe,
  updateProfile,
  uploadAvatar,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/user.controller';
import { authenticateToken } from '../middleware/authenticate';
import { handleAvatarUpload } from '../middleware/upload';

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
 * @route   PUT /api/users/profile
 * @desc    Update current authenticated user profile
 * @access  Private (Requires Bearer Token)
 */
router.put('/profile', authenticateToken, updateProfile);

/**
 * @route   POST /api/users/upload-avatar
 * @desc    Upload profile image (max 5MB), convert to WebP, and update user avatar
 * @access  Private (Requires Bearer Token)
 */
router.post('/upload-avatar', authenticateToken, handleAvatarUpload, uploadAvatar);

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
