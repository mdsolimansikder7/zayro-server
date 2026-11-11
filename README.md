# Zayro API

Express and MongoDB REST API for the Zayro clothing storefront.

## Run locally

1. Install Node.js 20.19+ and MongoDB 7+.
2. Copy `.env.example` to `.env`, then set `JWT_SECRET` to a random secret with at least 32 characters. Keep `.env` private.
   Set `GOOGLE_CLIENT_ID` to the same Google OAuth web client ID used by the frontend, and add `http://localhost:3000` to its authorized JavaScript origins.
3. Run `npm install`, then `npm run dev`.
4. The API listens on port `4000` by default. `GET /api/health` checks that the process is responding.

On the first successful MongoDB connection, the API initializes collections and indexes for every registered model. It inserts 13 sample products only when the `products` collection is empty, and adds two sample promo codes (`WELCOME10`, `ZAYRO20`) and default storefront content only when those records are absent. Existing catalog and storefront data is not overwritten.

To seed the catalog with 50 additional clothing products and upload their 150 images to Cloudflare R2, run `npm run seed:products`. The command upserts by product slug, verifies the R2 public URLs, and writes a NoSQLBooster-compatible export to `scripts/seed.js`.

To import 10 matching products per storefront category from Dorjibari's public Shopify catalog, run `npm run import:dorjibari`. Products are upserted with `dorjibari-` slugs, their first three source images are copied into R2, and existing products are preserved. The current Dorjibari sweatshirt collection contains 9 products, so that category imports 9 until another matching source item is available.

## MongoDB collections

The collection names below are the default Mongoose names. You can add or edit documents with MongoDB Compass or another MongoDB client. The storefront reads these collections directly; avoid changing existing product `slug` values after they have been linked.

| Collection | Main fields |
|---|---|
| `products` | `slug`, `title`, `image`, `images`, `price`, `oldPrice`, `discount`, `collectionName` (`new`, `top`, `detail`, `related`), `category`, `styles`, `description`, `colors`, `sizes`, `rating` |
| `users` | `name`, `email`, `passwordHash`, `addresses`, `wishlistSlugs`, `role` |
| `carts` | `user` (user ObjectId), `items` (`product`, `size`, `color`, `quantity`), `promoCode` |
| `orders` | `user`, item snapshots, calculated totals, `shippingAddress`, `paymentMethod`, `status` |
| `promocodes` | `code`, `type` (`percent` or `fixed`), `value`, `minimumSubtotal`, `active`, `expiresAt` |
| `subscribers` | `email` |
| `reviews` | `product`, `user`, `rating`, `title`, `text` |
| `storefronts` | `key: "default"`, `hero`, `heroStats`, `brands`, `navigation`, `dressStyles`, `faqs`, footer links, `socialLinks`, `paymentMethods`, `announcement`, `shipping` |

Storefront content is a single document keyed by `default`; edit that document to change home-page copy, banners, brands, nav/footer links, FAQ content, shipping fees, and available payment labels. Product images and storefront images should be publicly reachable image URLs or frontend public asset paths. `products.collectionName` controls which product shelf displays an item. Reviews and accounts are created through the API, rather than manually storing a plain-text password.

## API

All endpoints are prefixed with `/api`. JSON errors use `{ "error": "..." }`. Protected endpoints require `Authorization: Bearer <token>` from register or login.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Create an account and return a JWT |
| POST | `/auth/login` | Public | Sign in and return a JWT |
| POST | `/auth/google` | Public | Verify a Google Identity Services credential and return a JWT |
| GET, PATCH | `/auth/me` | Customer | Read or change the current profile name |
| POST | `/auth/change-password` | Customer | Change the current password |
| GET, PATCH | `/account` | Customer | Read or update saved addresses and wishlist |
| GET | `/products` | Public | Search/filter/sort products; supports `q`, `category`, `style`, `collection`, `size`, `color`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` |
| GET | `/products/categories` | Public | List product categories |
| GET | `/products/filters` | Public | Read categories, sizes, colors, and styles from the catalog |
| GET | `/products/:slug` | Public | Product details |
| GET, DELETE | `/cart` | Customer | Read or clear cart |
| POST | `/cart/items` | Customer | Add a product variant |
| PATCH, DELETE | `/cart/items/:itemId` | Customer | Change quantity or remove a cart item |
| POST | `/cart/promo` | Customer | Apply a promo code |
| POST | `/orders` | Customer | Create a cash-on-delivery order from the server-priced cart |
| GET | `/orders` | Customer | List the signed-in customer's orders |
| GET | `/orders/:orderId` | Customer | Read one of the signed-in customer's orders |
| POST | `/newsletter` | Public | Subscribe an email address |
| GET | `/products/:productId/reviews` | Public | List reviews and rating summary |
| POST | `/products/:productId/reviews` | Customer | Submit one review per product |
| GET | `/reviews/latest` | Public | List latest customer reviews for the home page |
| GET | `/storefront` | Public | Read the default storefront configuration |
| GET | `/admin` | Admin | Read store stats, products, orders, customers, and newsletter subscribers |
| POST, PATCH, DELETE | `/admin/products` and `/admin/products/:productId` | Admin | Create, update, and delete products |
| POST | `/admin/uploads` | Admin | Upload a product image to Cloudflare R2 from the admin device (up to 5 MB) |
| PATCH | `/admin/orders/:orderId` | Admin | Update an order status |

Cart/order totals use the storefront's 20% discount and `$15` delivery fee. A valid promo is applied on the discounted subtotal. Prices are the dollar amounts displayed by the frontend. Checkout currently records a cash-on-delivery order; it does not collect card details or process a payment.

## Safety and configuration

- Passwords are bcrypt-hashed, tokens are signed with `JWT_SECRET`, auth endpoints are rate-limited, and request bodies are size-limited.
- Google sign-in verifies the credential against Google's token-info endpoint, checks `GOOGLE_CLIENT_ID`, and creates or updates a backend user before issuing the same JWT used by password accounts.
- Product ratings are calculated from customer reviews; admins manage product details but do not enter ratings manually. Admin product image uploads are stored in Cloudflare R2 and saved as public URLs on the product.
- `CLIENT_ORIGIN` is a comma-separated allowlist for browser origins.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_URL` configure the Cloudflare R2 S3-compatible bucket. The public bucket URL must allow public reads for storefront images.
- `ADMIN_EMAIL` identifies the only email eligible for admin access. That user's database record must also have `role: "admin"`; all other users are denied.
- `GET /api/health` does not expose database credentials or user data.

## Admin access setup

Register the specified admin email through the storefront first. Then, using a trusted MongoDB shell, grant the role to that exact existing account once:

```js
db.users.updateOne(
  { email: "mdsolimansikder07@gmail.com" },
  { $set: { role: "admin" } }
)
```

Sign in with that account and open `/admin`. The route is not linked from storefront navigation or indexed by search engines; the API independently checks both the account role and the configured email.
