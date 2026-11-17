import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { MenuItem } from '../models/MenuItem.js';

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.DB_NAME || 'pizzahub',
    });
    console.log('Connected to MongoDB for Seeding...');

    // 1. Seed or update Admin
    const adminEmail = 'admin@pizzahub.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        name: 'PizzaHub Administrator',
        email: adminEmail,
        password: 'pass: 123456'.includes('123456') ? '123456' : '123456', // will be hashed by pre-save
        role: 'admin',
        image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        isBlocked: false,
      });
      console.log('✅ Admin user created: admin@pizzahub.com');
    } else {
      // Ensure password is 123456 and role is admin
      admin.password = '123456';
      admin.role = 'admin';
      admin.isBlocked = false;
      await admin.save();
      console.log('✅ Admin user updated: admin@pizzahub.com');
    }

    // 2. Seed Vendor 1 (Premium)
    let vendor1 = await User.findOne({ email: 'mario@pizzahub.com' });
    if (!vendor1) {
      vendor1 = await User.create({
        name: "Mario Rossi",
        email: 'mario@pizzahub.com',
        password: 'Vendor123',
        role: 'vendor',
        businessName: "Mario's Authentic Woodfire Pizza",
        image: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=300&q=80',
        subscriptionPlan: 'premium',
        isBlocked: false,
      });
      console.log('✅ Vendor 1 created: mario@pizzahub.com (Premium)');
    }

    // 3. Seed Vendor 2 (Free)
    let vendor2 = await User.findOne({ email: 'luigi@pizzahub.com' });
    if (!vendor2) {
      vendor2 = await User.create({
        name: "Luigi Moretti",
        email: 'luigi@pizzahub.com',
        password: 'Vendor123',
        role: 'vendor',
        businessName: "Napoli Slice & Crust Co.",
        image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80',
        subscriptionPlan: 'free',
        isBlocked: false,
      });
      console.log('✅ Vendor 2 created: luigi@pizzahub.com (Free)');
    }

    // 4. Seed Demo Customer
    let customer1 = await User.findOne({ email: 'customer@pizzahub.com' });
    if (!customer1) {
      customer1 = await User.create({
        name: 'Sarah Jenkins',
        email: 'customer@pizzahub.com',
        password: 'Customer123',
        role: 'customer',
        image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
        isBlocked: false,
      });
      console.log('✅ Customer created: customer@pizzahub.com');
    }

    // 5. Seed Real Pizza Menu Items
    const existingItemsCount = await MenuItem.countDocuments();
    if (existingItemsCount === 0) {
      const sampleItems = [
        {
          vendorId: vendor1._id,
          itemName: 'Neapolitan Margherita D.O.P.',
          category: 'Classic Pizzas',
          description:
            'San Marzano tomato sauce, fresh buffalo mozzarella, aromatic sweet basil leaves, and cold-pressed extra virgin olive oil baked in an 800° wood-fired oven.',
          price: 16.99,
          location: 'Downtown, New York',
          images: [
            'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?auto=format&fit=crop&w=800&q=80',
            'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor1._id,
          itemName: 'Double Pepperoni Overload',
          category: 'Meat Lovers',
          description:
            'Hand-tossed crispy crust loaded with double layers of smoked beef and pork pepperoni, whole milk mozzarella, and rich herb marinara sauce.',
          price: 19.5,
          location: 'Downtown, New York',
          images: [
            'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=800&q=80',
            'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor1._id,
          itemName: 'Truffle Wild Mushroom & Thyme',
          category: 'Specialty / Gourmet Pizzas',
          description:
            'Creamy roasted garlic white sauce, sautéed cremini & shiitake mushrooms, melted fontina cheese, fresh thyme, and aromatic white truffle oil.',
          price: 22.99,
          location: 'Downtown, New York',
          images: [
            'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor2._id,
          itemName: 'Mediterranean Garden Delight',
          category: 'Vegetarian Pizzas',
          description:
            'Ripe kalamata olives, marinated artichoke hearts, sun-dried tomatoes, roasted bell peppers, and crumbled Greek feta over golden crust.',
          price: 17.25,
          location: 'Brooklyn, New York',
          images: [
            'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor1._id,
          itemName: 'BBQ Smoked Chicken & Bacon',
          category: 'Meat Lovers',
          description:
            'Hickory smoked barbecue base, tender grilled chicken breast, crispy bacon bites, caramelized red onions, and melted sharp cheddar & mozzarella.',
          price: 20.5,
          location: 'Downtown, New York',
          images: [
            'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor2._id,
          itemName: 'Four Cheese (Quattro Formaggi)',
          category: 'Classic Pizzas',
          description:
            'A cheese lover paradise blending creamy mozzarella, aged gorgonzola, nutty fontina, and finely grated Parmigiano-Reggiano with fragrant herbs.',
          price: 18.0,
          location: 'Brooklyn, New York',
          images: [
            'https://images.unsplash.com/photo-1573821663912-569905455b1c?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor1._id,
          itemName: 'Golden Garlic Herb Dough Knots',
          category: 'Sides & Appetizers',
          description:
            'Freshly baked artisan bread knots tossed in melted garlic butter, parsley, and parmesan cheese. Served with warm marinara dipping sauce.',
          price: 7.99,
          location: 'Downtown, New York',
          images: [
            'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
        {
          vendorId: vendor2._id,
          itemName: 'Authentic Italian Tiramisu',
          category: 'Beverages & Desserts',
          description:
            'Espresso-soaked Savoiardi ladyfingers layered with smooth mascarpone cream and dusted with premium cocoa powder.',
          price: 8.5,
          location: 'Brooklyn, New York',
          images: [
            'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80',
          ],
          status: 'approved',
        },
      ];

      await MenuItem.insertMany(sampleItems);
      console.log(`✅ Seeded ${sampleItems.length} real pizza menu items!`);
    } else {
      console.log(`Menu items already exist (${existingItemsCount} items). Skipping insert.`);
    }

    console.log('🎉 Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedData();
