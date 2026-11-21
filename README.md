# 🍕 PizzaHub — Server (Backend API)

> Production-ready RESTful API for **PizzaHub — Pizza Ordering & Delivery Platform**, built with Express.js, MongoDB (Mongoose), JWT authentication, role-based authorization, and Stripe Webhooks.

---

## 🔗 Project Links
- **Live API Endpoint:** [https://pizzahub-server.onrender.com](https://pizzahub-server.onrender.com) *(Deploy URL)*
- **Client GitHub Repository:** [https://github.com/devabunayem/pizzahub-client](https://github.com/devabunayem/pizzahub-client)
- **Server GitHub Repository:** [https://github.com/devabunayem/pizzahub-server](https://github.com/devabunayem/pizzahub-server)

---

## 👤 Evaluation Credentials

| Role | Email | Password | Access Rights |
|---|---|---|---|
| **Admin** | `admin@pizzahub.com` | `123456` | Full platform control & audit |
| **Vendor (Premium)** | `mario@pizzahub.com` | `Vendor123` | Unlimited items, Stripe subscription |
| **Vendor (Free)** | `luigi@pizzahub.com` | `Vendor123` | Max 3 items tier |
| **Customer** | `customer@pizzahub.com` | `Customer123` | Place & cancel orders |

---

## 🛠️ Technology Stack & Packages

- **Runtime:** Node.js (ES Modules)
- **Framework:** Express.js
- **Database:** MongoDB Atlas (via Mongoose ODM)
- **Authentication:** JSON Web Tokens (`jsonwebtoken`) & `bcryptjs`
- **Payment Gateway:** Stripe Checkout & Webhook verification (`stripe`)
- **Security:** `cors`, `cookie-parser`, strict server-side RBAC

---

## 🗄️ Database Architecture (Exact 4 Business Collections)

1. **`users`:** `name`, `email`, `password`, `image`, `role` (`customer`, `vendor`, `admin`), `isBlocked`, `businessName`, `subscriptionPlan` (`free`, `premium`), `subscriptionExpiresAt`.
2. **`menuItems`:** `vendorId` (ref: `users`), `itemName`, `category`, `description`, `price`, `location`, `images` (array), `status` (`pending`, `approved`, `rejected`, `inactive`), `createdAt`.
3. **`orders`:** `itemId` (ref: `menuItems`), `vendorId` (ref: `users`), `customerId` (ref: `users`), `deliveryDate`, `deliveryAddress`, `message`, `status` (`pending`, `accepted`, `rejected`, `cancelled`), `createdAt`.
4. **`transactions`:** `vendorId` (ref: `users`), `plan`, `amount`, `currency`, `stripeSessionId`, `stripeSubscriptionId`, `status`, `createdAt`.

---

## 🛡️ Security & Authentication Architecture

1. **JWT Verification Middleware (`verifyToken`):**
   - Extracts Bearer token from the `Authorization` header or HTTP-only cookies.
   - Decodes and validates token signatures using `process.env.JWT_SECRET`.
   - Fetches the active user from MongoDB and enforces blocked account check (`isBlocked: true` returns `403 Forbidden`).

2. **Role-Based Access Control (`verifyRole`):**
   - Curries allowed roles e.g. `verifyRole('admin')`, `verifyRole('vendor')`.
   - Rejects unauthorized users with `403 Forbidden` if their assigned role does not meet the route requirement.

3. **Stripe Webhook Security (`handleStripeWebhook`):**
   - The `/api/subscription/webhook` route uses `express.raw({ type: 'application/json' })` strictly BEFORE `express.json()`.
   - Webhook signature is validated using `stripe.webhooks.constructEvent()` to prevent forged subscription events.

---

## ⚙️ Environment Variables (`.env`)

```env
PORT=5000
NODE_ENV=production
CLIENT_URL=http://localhost:3000

MONGODB_URI=mongodb+srv://...
DB_NAME=pizzahub

JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

IMGBB_API_KEY=your_imgbb_api_key
```

---

## 🚀 How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/devabunayem/pizzahub-server.git
   cd pizzahub-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   - Copy `.env.example` to `.env` and configure with your credentials.

4. **Seed initial database items & admin account:**
   ```bash
   npm run seed
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```
   Server will start on `http://localhost:5000`.

---

## 📡 API Endpoints Overview

### Public & Authentication
- `POST /api/auth/register` — Public registration (Customer or Vendor only).
- `POST /api/auth/login` — Sign in and receive JWT token.
- `GET /api/auth/me` — Retrieve current authenticated session profile.
- `PATCH /api/auth/profile` — Update name, avatar, and business details.

### Menu Management
- `GET /api/menu` — Public menu search, category/location filter, and price sort.
- `GET /api/menu/featured` — Top approved menu items for homepage.
- `GET /api/menu/:id` — Single menu item details.
- `POST /api/menu` — Vendor only: add menu item (checks 3 items free plan limit).
- `PATCH /api/menu/:id` — Vendor update or Admin moderation.
- `DELETE /api/menu/:id` — Vendor or Admin deletion.

### Order Processing
- `POST /api/orders` — Customer only: place food order.
- `GET /api/orders/my-orders` — Customer order history.
- `PATCH /api/orders/:id/cancel` — Customer cancel pending order.
- `GET /api/orders/vendor` — Vendor incoming orders.
- `PATCH /api/orders/:id/status` — Vendor accept or reject pending orders.

### Subscriptions & Payments
- `POST /api/subscription/create-checkout-session` — Vendor Stripe Checkout initialization.
- `POST /api/subscription/verify-session` — Direct server-to-server payment verification.
- `POST /api/subscription/webhook` — Stripe webhook event handler.

### Administration
- `GET /api/admin/stats` — High-level platform statistics.
- `GET /api/admin/users` — Search and filter platform users.
- `PATCH /api/admin/users/:id/block` — Toggle user block status.
- `GET /api/admin/menu-items` — Moderation view of all submitted menu items.
- `GET /api/admin/transactions` — Read-only ledger of subscription payments.
