import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Vendor ID is required'],
    },
    itemName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'Classic Pizzas',
        'Vegetarian Pizzas',
        'Meat Lovers',
        'Specialty / Gourmet Pizzas',
        'Sides & Appetizers',
        'Beverages & Desserts',
      ],
      default: 'Classic Pizzas',
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price must be positive'],
    },
    location: {
      type: String,
      required: [true, 'Location (area / city) is required'],
      trim: true,
    },
    images: {
      type: [String],
      required: [true, 'At least one image is required'],
      validate: [(val) => val.length > 0, 'At least one image is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'inactive'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast searching and filtering
menuItemSchema.index({ itemName: 'text', description: 'text' });
menuItemSchema.index({ status: 1, category: 1, location: 1, price: 1 });

export const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema, 'menuItems');
