import express from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { MenuItem } from '../models/MenuItem.js';
import { verifyToken, verifyRole } from '../middlewares/auth.js';

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Submit a new food order
 * @access  Private (Customer only)
 */
router.post('/', verifyToken, verifyRole('customer'), async (req, res) => {
  try {
    const { itemId, deliveryDate, deliveryAddress, message } = req.body;

    if (!itemId || !deliveryDate || !deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: 'Menu item ID, delivery date, and delivery address are required.',
      });
    }

    // Validate delivery date is not in the past
    const selectedDate = new Date(deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(selectedDate.getTime()) || selectedDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Delivery date cannot be in the past.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(404).json({
        success: false,
        message: 'The requested menu item does not exist.',
      });
    }

    // Verify item exists and is approved
    const item = await MenuItem.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'The requested menu item does not exist.',
      });
    }

    if (item.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved menu items can be ordered.',
      });
    }

    // Prevent ordering own item (if customer also owns vendor account)
    if (item.vendorId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vendors cannot order their own menu items.',
      });
    }

    // Prevent duplicate active orders for the same item and delivery date
    const orderDate = new Date(deliveryDate);
    const startOfDay = new Date(orderDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(orderDate.setHours(23, 59, 59, 999));

    const existingOrder = await Order.findOne({
      itemId,
      customerId: req.user._id,
      deliveryDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'accepted'] },
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active order for this item on the selected delivery date.',
      });
    }

    const newOrder = await Order.create({
      itemId,
      vendorId: item.vendorId,
      customerId: req.user._id,
      deliveryDate: new Date(deliveryDate),
      deliveryAddress: deliveryAddress.trim(),
      message: message ? message.trim() : '',
      status: 'pending',
    });

    const populatedOrder = await Order.findById(newOrder._id)
      .populate('itemId', 'itemName images price category location')
      .populate('vendorId', 'name businessName image email');

    res.status(201).json({
      success: true,
      message: 'Order placed successfully! The restaurant has been notified.',
      order: populatedOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to place order.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/orders/my-orders
 * @desc    Get logged in customer's orders
 * @access  Private (Customer only)
 */
router.get('/my-orders', verifyToken, verifyRole('customer'), async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.user._id })
      .populate('itemId', 'itemName images price category location')
      .populate('vendorId', 'name businessName image email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your orders.',
      error: error.message,
    });
  }
});

/**
 * @route   PATCH /api/orders/:id/cancel
 * @desc    Cancel a pending customer order
 * @access  Private (Customer only)
 */
router.patch('/:id/cancel', verifyToken, verifyRole('customer'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Ownership check: Customer cannot change another customer's order
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. You cannot modify another customer’s order.',
      });
    }

    // Can only cancel pending orders
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel this order because it is already ${order.status}.`,
      });
    }

    order.status = 'cancelled';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order has been successfully cancelled.',
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order.',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/orders/vendor
 * @desc    Get all orders received by the logged in vendor
 * @access  Private (Vendor only)
 */
router.get('/vendor', verifyToken, verifyRole('vendor'), async (req, res) => {
  try {
    const orders = await Order.find({ vendorId: req.user._id })
      .populate('itemId', 'itemName images price category')
      .populate('customerId', 'name email image')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor orders.',
      error: error.message,
    });
  }
});

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Vendor accepts or rejects a pending order (only once)
 * @access  Private (Vendor only)
 */
router.patch('/:id/status', verifyToken, verifyRole('vendor'), async (req, res) => {
  try {
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'accepted' or 'rejected'.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Vendor ownership check
    if (order.vendorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot manage orders that belong to other vendors.',
      });
    }

    // Only pending orders can be accepted or rejected, and only once
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Order has already been marked as ${order.status} and cannot be modified again.`,
      });
    }

    order.status = status;
    await order.save();

    res.status(200).json({
      success: true,
      message: `Order #${order._id.toString().slice(-6)} has been ${status}.`,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
      error: error.message,
    });
  }
});

export default router;
