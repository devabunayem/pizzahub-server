import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Middleware to verify JWT token from Authorization header or cookie
 */
export const verifyToken = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please sign in again.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Authorization failed.',
      });
    }

    // Fetch user from DB to verify active status and role
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    // Blocked user verification
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Access forbidden.',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server authentication error',
      error: error.message,
    });
  }
};

/**
 * Middleware for role-based authorization
 * @param  {...string} allowedRoles - 'admin', 'vendor', 'customer'
 */
export const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. You do not have permission to access this resource. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
};
