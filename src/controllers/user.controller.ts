import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/authenticate';

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

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    logger.info(
      `User registered successfully: ${newUser.email} (${newUser.role})`
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        ...newUser,
        phone: newUser.phone || undefined,
        avatar: newUser.avatar || undefined,
        createdAt: newUser.createdAt.toISOString(),
      },
      token,
    });

  } catch (error) {
    logger.error('Error during user registration:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error while registering user',
    });
  }
};

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

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
    });
  } catch (error) {
    logger.error('Error during user login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while logging in',
    });
  }
};

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

