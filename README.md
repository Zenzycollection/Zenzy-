# Zenzy Collection — Full-stack fashion store + CMS

Zenzy now includes a dedicated fashion-store content and operations backend. The useful CMS patterns from the Shri Khedapati project have been adapted to Zenzy's own data model and brand; temple-only modules (donations, devotees, pandits, puja, festivals and trust administration) have deliberately not been imported.

## Features
- Responsive fashion storefront, product catalogue, cart and demo checkout.
- Admin login at `/admin` with JWT session.
- Blog CMS: create, edit, draft, publish, delete, category, tags, author, cover image, SEO title, meta description and focus keyword.
- Public journal at `/blog` and individual articles at `/blog/:slug`.
- Image upload to Cloudinary from the article editor (JPG, PNG, WEBP, max 5 MB).
- Customer booking form for store visits, style consultations and bulk-order enquiries.
- Admin booking queue with status updates: NEW, CONTACTED, CONFIRMED, COMPLETED, CANCELLED.
- MongoDB persistence for articles and bookings; HTML sanitization for blog body content.

## Setup
1. Install Node.js 20+ and MongoDB (Atlas is fine).
2. `cd backend && npm install`
3. Copy `.env.example` to `.env` and set `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` and Cloudinary credentials.
4. Generate the admin password hash: `npm run make-admin-hash -- 'YourStrongPassword'` then paste the output into `ADMIN_PASSWORD_HASH`.
5. Run `npm run dev` and open `http://localhost:4000`.
6. Open `/admin` to sign in, publish articles and manage bookings. Public articles appear at `/blog`.

## Image uploads
The admin editor uploads images to Cloudinary in the `zenzy-collection` folder. Credentials stay on the server; never put Cloudinary API secrets in frontend JavaScript. If Cloudinary is not configured, you can still paste an already-hosted HTTPS image URL into the cover image field.

## API
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/articles` (public published articles)
- `GET /api/articles/:slug` (public published article)
- `GET /api/articles/admin/all` (admin)
- `GET /api/articles/admin/:id` (admin)
- `POST /api/articles`, `PUT /api/articles/:id`, `DELETE /api/articles/:id` (admin)
- `POST /api/media/image` (admin multipart field `image`)
- `POST /api/bookings` (public booking request)
- `GET /api/bookings/admin/all` and `PATCH /api/bookings/admin/:id` (admin)
- Existing products, categories, demo orders, contact and newsletter endpoints remain.

## Production checklist
- Configure MongoDB backups, a strong unique JWT secret, HTTPS and exact CORS origins.
- Set up Cloudinary and confirm upload quotas.
- Replace sample products and contact/social details.
- Current checkout remains a demo: no payment is collected and orders are held in memory. Add persistent order records, Razorpay/payment verification, inventory reservation, shipping, GST/invoices, transactional emails and privacy/returns policies before accepting live orders.
- Add CAPTCHA/rate limits and email/phone verification for public forms before high-traffic launch.
