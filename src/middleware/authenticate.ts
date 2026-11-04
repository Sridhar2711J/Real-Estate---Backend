import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  role: 'buyer' | 'seller';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUserPayload;
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUserPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      message: err?.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid or expired token.',
    });
  }
};

/**
 * Middleware ensuring the authenticated user has the 'seller' role
 */
export const requireSeller = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Access denied. Authentication required.',
    });
    return;
  }

  if (req.user.role !== 'seller') {
    res.status(403).json({
      success: false,
      message: 'Forbidden. Only sellers are authorized to perform this operation.',
    });
    return;
  }

  next();
};

/**
 * Optional token authentication middleware.
 * If a valid Bearer token is present, req.user will be populated.
 * If absent or invalid, req.user remains undefined and the request proceeds normally.
 */
export const optionalAuthenticateToken = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUserPayload;
    req.user = decoded;
  } catch {
    // Silently continue for optional auth
  }
  next();
};

