import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Vendor ID is required'],
    },
    plan: {
      type: String,
      required: true,
      default: 'premium',
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'usd',
      lowercase: true,
    },
    stripeSessionId: {
      type: String,
      default: '',
    },
    stripeSubscriptionId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['succeeded', 'pending', 'failed'],
      default: 'succeeded',
    },
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ vendorId: 1, createdAt: -1 });

export const Transaction =
  mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema, 'transactions');
