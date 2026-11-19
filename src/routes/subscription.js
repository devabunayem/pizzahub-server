import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { verifyToken, verifyRole } from '../middlewares/auth.js';

const router = express.Router();

// Helper to get Stripe client safely
const getStripe = () => {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

/**
 * @route   POST /api/subscription/create-checkout-session
 * @desc    Create Stripe Checkout Session for Vendor Premium Upgrade
 * @access  Private (Vendor only)
 */
router.post('/create-checkout-session', verifyToken, verifyRole('vendor'), async (req, res) => {
  try {
    const stripe = getStripe();
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const vendor = await User.findById(req.user._id);

    if (vendor.subscriptionPlan === 'premium') {
      return res.status(400).json({
        success: false,
        message: 'You already have an active Premium subscription.',
      });
    }

    // PizzaHub Vendor Premium Subscription: $29.99 / month
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PizzaHub Vendor Premium Plan',
              description:
                'Unlimited menu items, featured homepage placement, and official Premium Vendor badge.',
              images: [
                'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
              ],
            },
            unit_amount: 2999, // $29.99 USD
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: vendor.email,
      metadata: {
        vendorId: vendor._id.toString(),
        vendorEmail: vendor.email,
        plan: 'premium',
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
    });

    res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment session.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/subscription/verify-session
 * @desc    Direct Stripe server-to-server payment verification
 *          Ensures premium activation is backed by verified Stripe checkout status
 * @access  Private (Vendor only)
 */
router.post('/verify-session', verifyToken, verifyRole('vendor'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required for verification.',
      });
    }

    const stripe = getStripe();
    // Retrieve verified session directly from Stripe API
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment has not been completed or verified.',
      });
    }

    // Verify session belongs to the requesting vendor
    if (session.metadata?.vendorId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. This payment session does not belong to your account.',
      });
    }

    // Check if transaction already recorded
    let transaction = await Transaction.findOne({ stripeSessionId: session.id });
    if (!transaction) {
      transaction = await Transaction.create({
        vendorId: req.user._id,
        plan: 'premium',
        amount: (session.amount_total || 2999) / 100,
        currency: session.currency || 'usd',
        stripeSessionId: session.id,
        stripeSubscriptionId: session.subscription || '',
        status: 'succeeded',
      });
    }

    // Upgrade vendor account
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days premium

    const updatedVendor = await User.findByIdAndUpdate(
      req.user._id,
      {
        subscriptionPlan: 'premium',
        subscriptionExpiresAt: expiresAt,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully! Welcome to PizzaHub Premium.',
      vendor: updatedVendor,
      transaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment session.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/subscription/webhook
 * @desc    Stripe Webhook listener
 * @access  Public (Signature verified)
 */
export const handleStripeWebhook = async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Development or test event fallback
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const vendorId = session.metadata?.vendorId;

    if (vendorId) {
      try {
        // Record transaction
        const existingTx = await Transaction.findOne({ stripeSessionId: session.id });
        if (!existingTx) {
          await Transaction.create({
            vendorId,
            plan: 'premium',
            amount: (session.amount_total || 2999) / 100,
            currency: session.currency || 'usd',
            stripeSessionId: session.id,
            stripeSubscriptionId: session.subscription || '',
            status: 'succeeded',
          });
        }

        // Activate premium
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await User.findByIdAndUpdate(vendorId, {
          subscriptionPlan: 'premium',
          subscriptionExpiresAt: expiresAt,
        });

        console.log(`✅ Premium subscription activated via webhook for vendor: ${vendorId}`);
      } catch (err) {
        console.error('Failed to update vendor subscription via webhook:', err);
      }
    }
  }

  res.status(200).json({ received: true });
};

export default router;
