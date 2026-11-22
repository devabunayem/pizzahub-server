import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MenuItem } from '../models/MenuItem.js';
import { User } from '../models/User.js';
import { verifyToken, verifyRole } from '../middlewares/auth.js';

const router = express.Router();

const isValidHttpUrl = (val) => typeof val === 'string' && /^https?:\/\//i.test(val.trim());
const parseValidPrice = (val) => {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 && num <= 10000 ? num : null;
};
const VALID_CATEGORIES = MenuItem.schema.path('category').enumValues;
const VALID_STATUSES = MenuItem.schema.path('status').enumValues;

/**
 * @route   GET /api/menu
 * @desc    Public browse approved & active menu items with search, filter, and sort
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { search, category, location, sort, limit = 50, page = 1 } = req.query;

    const query = { status: 'approved' };

    // Search by item name or description
    if (search && search.trim() !== '') {
      query.$or = [
        { itemName: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Filter by category
    if (category && category !== 'All' && category !== '') {
      query.category = category;
    }

    // Filter by location
    if (location && location !== 'All' && location !== '') {
      query.location = { $regex: location.trim(), $options: 'i' };
    }

    // Sorting (Challenge requirement: price_asc, price_desc)
    let sortOptions = { createdAt: -1 }; // default newest
    if (sort === 'price_asc') {
      sortOptions = { price: 1 };
    } else if (sort === 'price_desc') {
      sortOptions = { price: -1 };
    } else if (sort === 'oldest') {
      sortOptions = { createdAt: 1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const items = await MenuItem.find(query)
      .populate('vendorId', 'name businessName image subscriptionPlan')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await MenuItem.countDocuments(query);

    res.status(200).json({
      success: true,
      count: items.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu items.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/menu/featured
 * @desc    Get at least 6 approved featured menu items for homepage (prioritizes premium vendors)
 * @access  Public
 */
router.get('/featured', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const rawItems = await MenuItem.find({ status: 'approved' })
      .populate('vendorId', 'name businessName image subscriptionPlan subscriptionExpiresAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(24);

    const isVendorActivePremium = (vendor) => {
      if (!vendor || vendor.subscriptionPlan !== 'premium') return false;
      if (!vendor.subscriptionExpiresAt) return true;
      return new Date(vendor.subscriptionExpiresAt) > new Date();
    };

    // Prioritize active Premium vendors first, then most recently updated/approved
    const sorted = rawItems.sort((a, b) => {
      const aPremium = isVendorActivePremium(a.vendorId) ? 1 : 0;
      const bPremium = isVendorActivePremium(b.vendorId) ? 1 : 0;
      if (bPremium !== aPremium) {
        return bPremium - aPremium;
      }
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    res.status(200).json({
      success: true,
      items: sorted.slice(0, 9),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured menu items.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/menu/vendor/my-items
 * @desc    Get all items belonging to the logged-in vendor
 * @access  Private (Vendor only)
 */
router.get('/vendor/my-items', verifyToken, verifyRole('vendor'), async (req, res) => {
  try {
    const items = await MenuItem.find({ vendorId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your menu items.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/menu/:id
 * @desc    Get single menu item details
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    const item = await MenuItem.findById(req.params.id).populate(
      'vendorId',
      'name businessName image subscriptionPlan email'
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    // If item is not approved, only the vendor owner or admin may view it
    if (item.status !== 'approved') {
      let canView = false;
      const authHeader = req.headers.authorization || req.cookies?.pizzahub_token;

      if (authHeader) {
        try {
          const token = authHeader.startsWith('Bearer ')
            ? authHeader.split(' ')[1]
            : authHeader;
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (
            decoded &&
            (decoded.role === 'admin' ||
              decoded.id === item.vendorId?._id?.toString())
          ) {
            canView = true;
          }
        } catch (e) {
          // Token invalid or expired
        }
      }

      if (!canView) {
        return res.status(403).json({
          success: false,
          message: 'This menu item is currently pending approval or inactive.',
        });
      }
    }

    res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve menu item.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/menu
 * @desc    Add a new menu item
 *          Free plan: max 3 active items. Premium: unlimited.
 * @access  Private (Vendor only)
 */
router.post('/', verifyToken, verifyRole('vendor'), async (req, res) => {
  try {
    const { itemName, category, description, price, location, images } = req.body;

    const cleanName = typeof itemName === 'string' ? itemName.trim() : '';
    const cleanDescription = typeof description === 'string' ? description.trim() : '';
    const cleanLocation = typeof location === 'string' ? location.trim() : '';
    const numPrice = parseValidPrice(price);

    if (!cleanName || !category || !cleanDescription || price === undefined || !cleanLocation || !images) {
      return res.status(400).json({
        success: false,
        message: 'All fields (name, category, description, price, location, images) are required.',
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category selected.',
      });
    }

    if (numPrice === null) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid number between $0.01 and $10,000.',
      });
    }

    const imageArray = (Array.isArray(images) ? images : [images])
      .filter((img) => typeof img === 'string')
      .map((img) => img.trim())
      .filter(Boolean);

    if (imageArray.length === 0 || !imageArray.every(isValidHttpUrl)) {
      return res.status(400).json({
        success: false,
        message: 'At least one valid http(s) image URL is required.',
      });
    }

    // Check vendor's subscription plan limit with active expiration check
    const vendor = await User.findById(req.user._id);
    const isPremium =
      vendor.subscriptionPlan === 'premium' &&
      (!vendor.subscriptionExpiresAt ||
        new Date(vendor.subscriptionExpiresAt) > new Date());

    if (!isPremium) {
      // Free plan: maximum 3 active/pending/approved items
      const currentActiveCount = await MenuItem.countDocuments({
        vendorId: req.user._id,
        status: { $in: ['pending', 'approved'] },
      });

      if (currentActiveCount >= 3) {
        return res.status(403).json({
          success: false,
          message:
            'Free plan limit reached (max 3 active items). Please upgrade to Premium for unlimited items.',
          limitReached: true,
        });
      }
    }

    const newItem = await MenuItem.create({
      vendorId: req.user._id,
      itemName: cleanName,
      category,
      description: cleanDescription,
      price: numPrice,
      location: cleanLocation,
      images: imageArray,
      status: 'pending', // Default status until admin approval
    });

    res.status(201).json({
      success: true,
      message: 'Menu item submitted successfully! Pending admin approval.',
      item: newItem,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item.',
      error: error.message,
    });
  }
});

/**
 * @route   PATCH /api/menu/:id
 * @desc    Update a menu item
 *          Vendor can update own items. Admin can approve/reject/update any item.
 * @access  Private (Vendor or Admin)
 */
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = item.vendorId.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. You can only update your own menu items.',
      });
    }

    const { itemName, category, description, price, location, images, status } = req.body;

    if (itemName !== undefined) {
      const cleanName = typeof itemName === 'string' ? itemName.trim() : '';
      if (!cleanName) {
        return res.status(400).json({
          success: false,
          message: 'Item name cannot be empty.',
        });
      }
      item.itemName = cleanName;
    }

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category selected.',
        });
      }
      item.category = category;
    }

    if (description !== undefined) {
      const cleanDesc = typeof description === 'string' ? description.trim() : '';
      if (!cleanDesc) {
        return res.status(400).json({
          success: false,
          message: 'Description cannot be empty.',
        });
      }
      item.description = cleanDesc;
    }

    if (price !== undefined) {
      const numPrice = parseValidPrice(price);
      if (numPrice === null) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a valid number between $0.01 and $10,000.',
        });
      }
      item.price = numPrice;
    }

    if (location !== undefined) {
      const cleanLoc = typeof location === 'string' ? location.trim() : '';
      if (!cleanLoc) {
        return res.status(400).json({
          success: false,
          message: 'Kitchen location cannot be empty.',
        });
      }
      item.location = cleanLoc;
    }

    if (images !== undefined) {
      const imageArray = (Array.isArray(images) ? images : [images])
        .filter((img) => typeof img === 'string')
        .map((img) => img.trim())
        .filter(Boolean);
      if (imageArray.length === 0 || !imageArray.every(isValidHttpUrl)) {
        return res.status(400).json({
          success: false,
          message: 'At least one valid http(s) image URL is required.',
        });
      }
      item.images = imageArray;
    }

    // Status management:
    // Admin can change to 'approved', 'rejected', 'pending', or 'inactive'
    // Vendor can toggle availability ('inactive' or back to 'approved' if within plan limits)
    if (status !== undefined) {
      if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be pending, approved, rejected, or inactive.',
        });
      }

      if (isAdmin) {
        item.status = status;
      } else if (isOwner) {
        if (status === 'inactive') {
          item.status = 'inactive';
        } else if (status === 'approved' && item.status === 'inactive') {
          const vendor = await User.findById(req.user._id);
          const isPremium =
            vendor.subscriptionPlan === 'premium' &&
            (!vendor.subscriptionExpiresAt ||
              new Date(vendor.subscriptionExpiresAt) > new Date());

          if (!isPremium) {
            const currentActiveCount = await MenuItem.countDocuments({
              vendorId: req.user._id,
              _id: { $ne: item._id },
              status: { $in: ['pending', 'approved'] },
            });
            if (currentActiveCount >= 3) {
              return res.status(403).json({
                success: false,
                message:
                  'Free plan limit reached (max 3 active items). Please upgrade to Premium to activate more items.',
                limitReached: true,
              });
            }
          }
          item.status = 'approved';
        } else {
          return res.status(403).json({
            success: false,
            message: 'Only administrators can approve, reject, or set this status.',
          });
        }
      }
    }

    await item.save();

    res.status(200).json({
      success: true,
      message: 'Menu item updated successfully.',
      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item.',
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/menu/:id
 * @desc    Delete a menu item
 *          Vendor can delete own items. Admin can delete any item.
 * @access  Private (Vendor or Admin)
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = item.vendorId.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. You cannot delete this menu item.',
      });
    }

    await MenuItem.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Menu item deleted successfully.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item.',
      error: error.message,
    });
  }
});

export default router;
