<div align="center">

<!-- Animated SVG Header -->
<a href="https://pizzahub-server-three-opal.vercel.app">
  <img src="https://readme-typing-svg.demolab.com?font=Anton&size=36&duration=3200&pause=1400&color=E50916&center=true&vCenter=true&width=760&height=65&lines=PIZZAHUB+API+%E2%80%94+EXPRESS+%26+MONGODB;RBAC+SECURITY+%E2%80%A2+STRIPE+WEBHOOKS" alt="PizzaHub Server Animated Header" />
</a>

<p align="center">
  <strong>Backend REST API for PizzaHub — enforcing JWT authentication, role-based access control, vendor item quotas, order integrity, and Stripe webhook verification.</strong>
</p>

<p align="center">
  <a href="https://pizzahub-server-three-opal.vercel.app">
    <img src="https://img.shields.io/badge/LIVE_API-Online-18120E?style=for-the-badge&logo=express&logoColor=white" alt="Live API" />
  </a>
  <a href="https://pizzahub-client-smoky.vercel.app">
    <img src="https://img.shields.io/badge/LIVE_APP-PizzaHub-E50916?style=for-the-badge&logo=vercel&logoColor=white" alt="Live App" />
  </a>
  <a href="https://github.com/devabunayem/pizzahub-server">
    <img src="https://img.shields.io/badge/SERVER_REPO-GitHub-D97706?style=for-the-badge&logo=github&logoColor=white" alt="Server Repo" />
  </a>
  <a href="https://github.com/devabunayem/pizzahub-client">
    <img src="https://img.shields.io/badge/CLIENT_REPO-GitHub-18120E?style=for-the-badge&logo=github&logoColor=white" alt="Client Repo" />
  </a>
</p>

<p align="center">
  <img src="https://skillicons.dev/icons?i=nodejs,express,mongodb,js,vercel,git&perline=6" alt="Backend Stack Icons" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Express-5.3-18120E?style=flat-square&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/Mongoose-9.12-880000?style=flat-square&logo=mongoose&logoColor=white" alt="Mongoose" />
  <img src="https://img.shields.io/badge/JWT-jsonwebtoken-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" alt="JWT" />
  <img src="https://img.shields.io/badge/Stripe-Webhooks_%26_Checkout-635BFF?style=flat-square&logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/bcryptjs-Password_Hashing-D97706?style=flat-square&logo=letsencrypt&logoColor=white" alt="bcryptjs" />
  <img src="https://img.shields.io/badge/CORS-Credentialed_Origins-18120E?style=flat-square&logo=cloudflare&logoColor=white" alt="CORS" />
</p>

</div>

---

## Project Links & Evaluation Credentials

| Resource | URL |
|---|---|
| **Live API Endpoint** | [https://pizzahub-server-three-opal.vercel.app](https://pizzahub-server-three-opal.vercel.app) |
| **Live Web App** | [https://pizzahub-client-smoky.vercel.app](https://pizzahub-client-smoky.vercel.app) |
| **Server Repository** | [https://github.com/devabunayem/pizzahub-server](https://github.com/devabunayem/pizzahub-server) |
| **Client Repository** | [https://github.com/devabunayem/pizzahub-client](https://github.com/devabunayem/pizzahub-client) |

### Evaluation Credentials

| Role | Email | Password | Scope |
|---|---|---|---|
| **Admin** | `admin@pizzahub.com` | `123456` | Full moderation, user block/unblock, transaction ledger |
| **Vendor (Premium)** | `mario@pizzahub.com` | `Vendor123` | Unlimited menu items, featured priority, order control |
| **Vendor (Free)** | `luigi@pizzahub.com` | `Vendor123` | Max 3 active items, Stripe Premium upgrade flow |
| **Customer** | `customer@pizzahub.com` | `Customer123` | Place/cancel orders, post item reviews |

---

## Challenges & Engineering Architecture

### 1. JWT & Role-Based Middleware Flow (`src/middlewares/auth.js`)
Every private endpoint passes through two composable guards before reaching route business logic:

```
Incoming Request
   │
   ▼
[ verifyToken ]
   ├── Reads Bearer token (Authorization header) or req.cookies.token
   ├── Missing token? ─────────────────────────► 401 Unauthorized
   ├── jwt.verify(JWT_SECRET) fails/expired? ──► 401 Unauthorized
   ├── User missing from MongoDB? ─────────────► 401 Unauthorized
   ├── user.isBlocked === true? ───────────────► 403 Forbidden
   └── Attaches live DB record to req.user ──► next()
          │
          ▼
[ verifyRole(...allowedRoles) ]
   ├── !allowedRoles.includes(req.user.role) ──► 403 Forbidden
   └── Ownership Check (vendorId / customerId === req.user._id) ──► Route Handler
```

- **Why re-fetch the user on every request?** A cached JWT claim wouldn't catch a user who was just blocked by an Admin or upgraded via Stripe seconds ago. Reading the live `User` doc guarantees real-time enforcement.
- **Anti-Tamper Protections:**
  - `POST /api/auth/register` and `/api/auth/google` strip/reject `'admin'` roles — public signups can only ever create `'customer'` or `'vendor'`.
  - `PATCH /api/auth/profile` explicitly whitelists `{ name, image, businessName }` so sending `{ role: 'admin', subscriptionPlan: 'premium' }` in DevTools is silently ignored.

### 2. Advanced Search, Filter & Price Sort (`GET /api/menu`)
Implemented cleanly in `src/routes/menu.js` with compound MongoDB indexes on `{ status, category, location, price }` and text indexes on `{ itemName, description }`:

| Query Param | Behavior | Example |
|---|---|---|
| `search` | Case-insensitive regex across `itemName` and `description` | `?search=pepperoni` |
| `category` | Exact match on one of the 6 allowed categories (omitted on `All`) | `?category=Meat%20Lovers` |
| `location` | Case-insensitive partial regex match on restaurant area/city | `?location=Brooklyn` |
| `sort` | `price_asc` (`price: 1`), `price_desc` (`price: -1`), `oldest`, or `newest` (default) | `?sort=price_asc` |
| `page` / `limit` | Server-side skip/limit pagination returning `total` & `totalPages` | `?page=1&limit=12` |

All public `GET /api/menu` requests hardcode `status: 'approved'` so `pending`, `rejected`, or `inactive` dishes are invisible until moderated. Meanwhile, `GET /api/menu/featured` checks live `subscriptionExpiresAt` timestamps so active **Premium** kitchens surface first.

### 3. Stripe Webhook Raw-Body Ordering & Security (`src/server.js` & `src/routes/subscription.js`)
One classic Express + Stripe pitfall is mounting `express.json()` globally before the webhook route, which mutates the raw payload buffer and breaks `stripe.webhooks.constructEvent()` signature verification.
- **Solution:** `POST /api/subscription/webhook` is registered in `src/server.js` **before** `app.use(express.json())` using `express.raw({ type: 'application/json' })`.
- Checkout sessions lock `metadata.vendorId` from `req.user._id` on the server (so nobody can pay/activate Premium for another vendor ID).
- Duplicate webhook deliveries are made idempotent by checking `Transaction.findOne({ stripeSessionId: session.id })` before recording a payment.

### 4. Business Rules Inside `menuItems` & `orders`
- **Free Vendor 3-Item Limit:** Checked both on `POST /api/menu` and when flipping an `inactive` item back to `approved` via `PATCH /api/menu/:id` (`pending` and `approved` count toward the 3 active slots; `rejected` / `inactive` do not).
- **Duplicate Order Prevention:** `POST /api/orders` normalizes the delivery date to a UTC day range (`00:00:00`–`23:59:59`) and blocks placing a duplicate `pending` or `accepted` order for the same `customerId + itemId + day`.
- **Single-Collection Reviews:** Customer ratings & comments (`POST /api/menu/:id/reviews`) live directly as an embedded array on `MenuItem` alongside cached `averageRating` and `reviewCount`, avoiding unnecessary collections while supporting instant per-user review updates.

---

## Database Schema (Exact 4 MongoDB Collections)

1. **`users`** — `name`, `email`, `password` (hashed), `image`, `role` (`customer` | `vendor` | `admin`), `isBlocked`, `businessName`, `subscriptionPlan` (`free` | `premium`), `subscriptionExpiresAt`.
2. **`menuItems`** — `vendorId` (ref: `User`), `itemName`, `category`, `description`, `price`, `location`, `images[]`, `status` (`pending` | `approved` | `rejected` | `inactive`), embedded `reviews[]`, `averageRating`, `reviewCount`, `createdAt`.
3. **`orders`** — `itemId` (ref: `MenuItem`), `vendorId` (ref: `User`), `customerId` (ref: `User`), `deliveryDate`, `deliveryAddress`, `message`, `status` (`pending` | `accepted` | `rejected` | `cancelled`), `createdAt`.
4. **`transactions`** — `vendorId` (ref: `User`), `plan`, `amount`, `currency`, `stripeSessionId`, `stripeSubscriptionId`, `status`, `createdAt`.

---

## API Endpoints Reference

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Public signup (`customer` or `vendor` only) + password validation (`>= 6 chars`, upper & lower case)
- `POST /api/auth/login` — Credential login returning signed JWT
- `POST /api/auth/google` — Verify Google profile and mint server JWT
- `GET /api/auth/me` — Fetch active authenticated profile (`verifyToken`)
- `PATCH /api/auth/profile` — Update editable fields (`verifyToken`; locks `role` & `subscriptionPlan`)

### Menu Items & Reviews (`/api/menu`)
- `GET /api/menu` — Public browse with `search`, `category`, `location`, `sort`, `page`, `limit`
- `GET /api/menu/featured` — Top approved items prioritizing active Premium vendors
- `GET /api/menu/vendor/my-items` — Vendor's own dishes across all statuses (`vendor`)
- `GET /api/menu/:id` — Single item details + reviews (non-approved visible only to owner/admin)
- `POST /api/menu` — Create item with 3-active limit check for Free tier (`vendor`)
- `POST /api/menu/:id/reviews` — Submit or update customer star rating & comment (`customer`)
- `PATCH /api/menu/:id` — Vendor edit/availability or Admin approval moderation (`vendor` | `admin`)
- `DELETE /api/menu/:id` — Delete item (`vendor` owner | `admin`)

### Orders (`/api/orders`)
- `POST /api/orders` — Place order with self-order block & same-day duplicate guard (`customer`)
- `GET /api/orders/my-orders` — Customer order history (`customer`)
- `PATCH /api/orders/:id/cancel` — Cancel `pending` order only (`customer` owner)
- `GET /api/orders/vendor` — Incoming orders for the signed-in vendor (`vendor`)
- `PATCH /api/orders/:id/status` — Accept or reject a `pending` order once (`vendor` owner)

### Subscriptions & Webhooks (`/api/subscription`)
- `POST /api/subscription/create-checkout-session` — Create Stripe Checkout session for `$29.99` Premium upgrade (`vendor`)
- `POST /api/subscription/verify-session` — Server-to-server Stripe session check (`vendor`)
- `POST /api/subscription/webhook` — Signature-verified Stripe event handler (raw body)

### Administration (`/api/admin`)
- `GET /api/admin/stats` — Aggregated counts and revenue stats (`admin`)
- `GET /api/admin/users` — Search & filter users by role (`admin`)
- `PATCH /api/admin/users/:id/block` — Block/unblock account (`admin`, self-block prevented)
- `GET /api/admin/menu-items` — View and filter all vendor submissions (`admin`)
- `GET /api/admin/transactions` — Read-only Stripe payment audit ledger (`admin`)

---

## Technology Stack & Packages

- **Runtime & Framework:** Node.js (ES Modules), `express` (`^5.3.0`)
- **Database & ODM:** MongoDB Atlas (`mongodb` `^7.9.0`, `mongoose` `^9.12.2`)
- **Auth & Security:** `jsonwebtoken` (`^9.0.3`), `bcryptjs` (`^3.0.3`), `cookie-parser` (`^1.4.7`), `cors` (`^2.8.6`)
- **Payments & Config:** `stripe` (`^23.1.0`), `dotenv` (`^18.0.10`)

---

## Environment Variables (`.env`)

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

MONGODB_URI=your_mongodb_connection_string
DB_NAME=pizzahub

JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret

IMGBB_API_KEY=your_imgbb_api_key
```

---

## Run Locally

```bash
# 1. Clone the server repository
git clone https://github.com/devabunayem/pizzahub-server.git
cd pizzahub-server

# 2. Install packages
npm install

# 3. Configure environment variables
cp .env.example .env
# Add your MongoDB URI, JWT secret, Stripe keys, and CLIENT_URL

# 4. Seed sample users & wood-fired pizzas (optional)
npm run seed

# 5. Start the API server
npm run dev
```

Server listens on [http://localhost:5000](http://localhost:5000).
