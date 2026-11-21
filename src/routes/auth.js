import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { verifyToken } from '../middlewares/auth.js';

const router = express.Router();

// Helper to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// Password validator: min 6 chars, 1 uppercase, 1 lowercase
const validatePassword = (password) => {
  if (!password || password.length < 6) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  return hasUpper && hasLower;
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new customer or vendor
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, image, role, businessName } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required.',
      });
    }

    // Role check: Only customer or vendor can be registered publicly
    if (!['customer', 'vendor'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Only Customer or Vendor registration is allowed.',
      });
    }

    // Password rules validation: minimum 6 characters, one uppercase letter, one lowercase letter
    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 6 characters long and contain at least one uppercase letter and one lowercase letter.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Create user
    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      image: image || '',
      role,
      businessName: role === 'vendor' ? businessName || `${name}'s Pizza Kitchen` : '',
      subscriptionPlan: 'free',
      isBlocked: false,
    });

    const token = generateToken(newUser);

    // Remove password from response
    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to PizzaHub.',
      token,
      user: userResponse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Sign in with email and password
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Find user with password selected
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check if blocked
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.',
      });
    }

    const token = generateToken(user);
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: userResponse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Login failed.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/auth/google
 * @desc    Sign in or register via verified Google OAuth session
 * @access  Public
 */
router.post('/google', async (req, res) => {
  try {
    const { name, email, image, role, businessName } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google account email is required.',
      });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      if (user.isBlocked) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been blocked. Please contact support.',
        });
      }

      if (image && !user.image) {
        user.image = image;
        await user.save();
      }
    } else {
      const safeRole = ['customer', 'vendor'].includes(role) ? role : 'customer';
      const displayName = (name || email.split('@')[0] || 'Pizza Lover').trim();
      const randomPassword = `${crypto.randomBytes(16).toString('hex')}Aa1`;

      user = await User.create({
        name: displayName,
        email: email.toLowerCase(),
        password: randomPassword,
        image: image || '',
        role: safeRole,
        businessName:
          safeRole === 'vendor'
            ? (businessName || `${displayName}'s Pizza Kitchen`).trim()
            : '',
        subscriptionPlan: 'free',
        isBlocked: false,
      });
    }

    const token = generateToken(user);
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: `Welcome, ${user.name}!`,
      token,
      user: userResponse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Google authentication sync failed.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile.',
      error: error.message,
    });
  }
});

/**
 * @route   PATCH /api/auth/profile
 * @desc    Update profile (name, image, businessName)
 *          Cannot change role or subscriptionPlan
 * @access  Private
 */
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const { name, image, businessName } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name.trim();
    if (image !== undefined) user.image = image.trim();
    if (user.role === 'vendor' && businessName) {
      user.businessName = businessName.trim();
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile.',
      error: error.message,
    });
  }
});

export default router;
