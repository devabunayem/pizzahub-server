import express from 'express';
import { User } from '../models/User.js';
import { MenuItem } from '../models/MenuItem.js';
import { Transaction } from '../models/Transaction.js';
import { verifyToken, verifyRole } from '../middlewares/auth.js';

const router = express.Router();

// Apply admin verification to all admin routes
router.use(verifyToken, verifyRole('admin'));

/**
 * @route   GET /api/admin/stats
 * @desc    Get platform overview metrics
 * @access  Private (Admin only)
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalMenuItems,
      pendingMenuItems,
      totalTransactions,
      transactionsSum,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ role: 'customer' }),
      MenuItem.countDocuments(),
      MenuItem.countDocuments({ status: 'pending' }),
      Transaction.countDocuments(),
      Transaction.aggregate([
        { $match: { status: 'succeeded' } },
        { $group: { _id: null, totalRevenue: { $sum: '$amount' } } },
      ]),
    ]);

    const revenue = transactionsSum[0]?.totalRevenue || 0;

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalMenuItems,
        pendingMenuItems,
        totalTransactions,
        totalRevenue: revenue,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin stats.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/admin/users
 * @desc    View all users with search and role filter
 * @access  Private (Admin only)
 */
router.get('/users', async (req, res) => {
  try {
    const { search, role } = req.query;
    const query = {};

    if (search && search.trim() !== '') {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (role && ['customer', 'vendor', 'admin'].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users.',
      error: error.message,
    });
  }
});

/**
 * @route   PATCH /api/admin/users/:id/block
 * @desc    Block or Unblock a user
 * @access  Private (Admin only)
 */
router.patch('/users/:id/block', async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Prevent admin from blocking themselves
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block your own admin account.',
      });
    }

    targetUser.isBlocked = !targetUser.isBlocked;
    await targetUser.save();

    res.status(200).json({
      success: true,
      message: `User ${targetUser.email} has been ${targetUser.isBlocked ? 'blocked' : 'unblocked'}.`,
      user: targetUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user block status.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/admin/menu-items
 * @desc    View all menu items with search and status filter
 * @access  Private (Admin only)
 */
router.get('/menu-items', async (req, res) => {
  try {
    const { search, status, category } = req.query;
    const query = {};

    if (search && search.trim() !== '') {
      query.itemName = { $regex: search.trim(), $options: 'i' };
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    const items = await MenuItem.find(query)
      .populate('vendorId', 'name email businessName subscriptionPlan')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve menu items for admin.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/admin/transactions
 * @desc    View platform transactions (Read-only, no editing permitted)
 * @access  Private (Admin only)
 */
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('vendorId', 'name email businessName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions.',
      error: error.message,
    });
  }
});

export default router;
