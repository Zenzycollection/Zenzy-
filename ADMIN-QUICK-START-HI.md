# Zenzy Admin — Quick Start (Hindi)

## 1. Backend setup

```bash
cd backend
npm install
```

`.env.example` ko copy karke `.env` banayein. Isme MongoDB Atlas connection string, JWT secret, admin email aur Cloudinary keys bharein.

## 2. Admin password set karein

```bash
npm run make-admin-hash -- 'ApnaStrongPasswordYahan'
```

Terminal me jo bcrypt hash mile, use `.env` ke `ADMIN_PASSWORD_HASH` me paste karein. Plain password ko `.env` me save na karein.

## 3. Website start karein

```bash
npm run dev
```

- Website: `http://localhost:4000`
- Admin dashboard: `http://localhost:4000/admin`
- Public blog: `http://localhost:4000/blog`

## 4. Blog publish kaise karein

1. `/admin` par admin email/password se login karein.
2. Article title, category, excerpt aur content likhein.
3. Editor toolbar se bold, italic, headings, list aur quote add karein.
4. Cover image upload karein. Upload ke liye Cloudinary credentials set hona zaroori hai. Chahein to hosted image URL bhi paste kar sakte hain.
5. SEO title, meta description, focus keyword aur tags add karein.
6. `Save as draft` se draft rakhein ya `Publish now` se live karein.
7. Published article `/blog` par dikhega.

## 5. Booking requests manage kaise karein

Customer homepage par `Let's find your fit` form submit karega. Request `/admin` ke `Customer Bookings` tab me aayegi. Wahan status ko NEW, CONTACTED, CONFIRMED, COMPLETED ya CANCELLED kar sakte hain.

## Important

MongoDB aur `.env` values set kiye bina CMS, admin login, image upload aur bookings APIs kaam nahi karenge. Existing product listing aur demo storefront MongoDB ke bina bhi run ho sakta hai. Checkout abhi demo hai, real payment nahi leta.
