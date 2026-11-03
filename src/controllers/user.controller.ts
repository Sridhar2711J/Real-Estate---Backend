import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { sendPasswordResetEmail } from '../utils/email';

/**
 * Helper to generate access and refresh tokens
 */
const generateAuthTokens = async (user: { id: string; email: string; role: string }) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as any }
  );

  // Store refresh token in database for rotation/revocation
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  return { token, refreshToken };
};

/**
 * Register User
 * POST /api/users/register
 */
export const registerUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters long',
      });
      return;
    }

    if (
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
      return;
    }

    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
      return;
    }

    if (phone !== undefined && typeof phone !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Phone must be a string',
      });
      return;
    }

    const userRole = role === undefined ? 'buyer' : role;

    if (userRole !== 'buyer' && userRole !== 'seller') {
      res.status(400).json({
        success: false,
        message: 'Role must be either buyer or seller',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
 
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'A user with this email address already exists.',
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone ? phone.trim() : null,
        role: userRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });

    logger.info(`User registered successfully: ${newUser.email} (${newUser.role})`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone || undefined,
        avatar: newUser.avatar || undefined,
        role: newUser.role,
        createdAt: newUser.createdAt.toISOString(),
      },
    });

  } catch (error) {
    logger.error('Error during user registration:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error while registering user',
    });
  }
};

/**
 * Login User
 * POST /api/users/login
 */
export const loginUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
      return;
    }

    if (!password || typeof password !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Please provide your password.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
      return;
    }

    const { token, refreshToken } = await generateAuthTokens(user);

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || undefined,
      avatar: user.avatar || undefined,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    logger.info(`User logged in successfully: ${safeUser.email} (${safeUser.role})`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: safeUser,
      token,
      refreshToken,
    });
  } catch (error) {
    logger.error('Error during user login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while logging in',
    });
  }
};

/**
 * Refresh Access Token
 * POST /api/users/refresh-token
 */
export const refreshTokenHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const providedRefreshToken = req.body.refreshToken || req.headers['x-refresh-token'];

    if (!providedRefreshToken || typeof providedRefreshToken !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Refresh token is required.',
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(providedRefreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please sign in again.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user || user.refreshToken !== providedRefreshToken) {
      res.status(401).json({
        success: false,
        message: 'Refresh token is revoked or no longer valid.',
      });
      return;
    }

    // Generate new tokens (token rotation)
    const { token, refreshToken: newRefreshToken } = await generateAuthTokens(user);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error('Error refreshing token:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error refreshing token',
    });
  }
};

/**
 * Logout User
 * POST /api/users/logout
 */
export const logoutUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const providedRefreshToken = req.body?.refreshToken;

    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
    } else if (providedRefreshToken) {
      await prisma.user.updateMany({
        where: { refreshToken: providedRefreshToken },
        data: { refreshToken: null },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    logger.error('Error during logout:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during logout',
    });
  }
};

/**
 * Get Current User Profile
 * GET /api/users/me
 */
export const getMe = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized. Token is missing or invalid.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        ...user,
        phone: user.phone || undefined,
        avatar: user.avatar || undefined,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching current user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error fetching user data',
    });
  }
};

/**
 * Forgot Password - Send OTP
 * POST /api/users/forgot-password
 */
export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found. Please register before trying to log in.',
      });
      return;
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtp: otp,
        resetOtpExpiry: expiry,
      },
    });

    // Send email using template
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      otp,
    });

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email address.',
    });
  } catch (error) {
    logger.error('Error during forgot password request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error processing password reset request',
    });
  }
};

/**
 * Verify OTP
 * POST /api/users/verify-otp
 */
export const verifyOtp = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400).json({
        success: false,
        message: 'Email and OTP code are required.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.resetOtp || !user.resetOtpExpiry) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code. Please request a new one.',
      });
      return;
    }

    if (user.resetOtpExpiry < new Date()) {
      res.status(400).json({
        success: false,
        message: 'This OTP code has expired. Please request a new code.',
      });
      return;
    }

    if (user.resetOtp !== otp.trim()) {
      res.status(400).json({
        success: false,
        message: 'Incorrect verification code. Please check and try again.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
    });
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while verifying OTP',
    });
  }
};

/**
 * Reset Password
 * POST /api/users/reset-password
 */
export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required.',
      });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.resetOtp || !user.resetOtpExpiry) {
      res.status(400).json({
        success: false,
        message: 'Invalid request or expired verification code.',
      });
      return;
    }

    if (user.resetOtpExpiry < new Date() || user.resetOtp !== otp.trim()) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code. Please try again.',
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetOtp: null,
        resetOtpExpiry: null,
        refreshToken: null, // Invalidate any existing sessions
      },
    });

    logger.info(`Password reset successfully for user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully. You can now log in.',
    });
  } catch (error) {
    logger.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resetting password',
    });
  }
};

