# PhoneClub Auth Setup

## Install

```bash
npm install bcrypt jsonwebtoken cookie-parser helmet express-rate-limit express-validator google-auth-library nodemailer redis
```
<!-- credential -->

## Environment

Add these values to `.env`. Use long random secrets in real environments.

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=phone_club
JWT_ACCESS_SECRET=70cf0f8dfef9b0207eb33f588362bba638aca0ce1baea95fa33121a25f9badb4
JWT_REFRESH_SECRET=646099492f27a9ef64e6a36fd0cf3ec11ab9e22b829f465bed0514c5d9c60d5a
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=7
GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
EMAIL_FROM="PhoneClub" <noreply@thephoneclub.in>
REGISTRATION_OTP_EXPIRES_IN_MINUTES=10
PASSWORD_RESET_OTP_EXPIRES_IN_MINUTES=10
PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES=10
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password
# REDIS_URL=redis://:password@hostname:6379
FRONTEND_URL=http://localhost:8080
NODE_ENV=development
```



In development, the refresh cookie uses `Secure: false` and `SameSite=Lax` so it works on `http://localhost`.
In production, set `NODE_ENV=production`, serve over HTTPS, and the cookie uses `Secure: true` and `SameSite=None`.

## Database

Run the migration:

```bash
mysql -u root -p phone_club < migrations/001_auth_tables.sql
```

If you already created the original auth tables before Google login was added, run:

```bash
mysql -u root -p phone_club < migrations/002_google_auth_users.sql
```

For persistent user carts, run:

```bash
mysql -u root -p phone_club < migrations/003_cart_items.sql
```

For email-verified local registration, this app now uses Redis to cache pending OTP registrations rather than a database table.

## Start

```bash
npm start
```

## APIs

- `POST /api/auth/register`
- `POST /api/auth/confirm-otp`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/verify-forgot-password-otp`
- `POST /api/auth/reset-password`
- `POST /api/auth/google`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/profile` example protected route

## Cart APIs

All cart APIs require the access token header:

```http
Authorization: Bearer <accessToken>
```

- `GET /api/cart`
- `POST /api/cart/items` with `{ "product_id": "product-id", "quantity": 1 }`
- `PATCH /api/cart/items/:productId` with `{ "quantity": 2 }`
- `DELETE /api/cart/items/:productId`
- `DELETE /api/cart`

Cart items are saved by `user_id`, so they remain available after logout and login.

The access token is returned in JSON and should be kept in frontend memory. The refresh token is stored only in an HttpOnly cookie.

## Email OTP registration

`POST /api/auth/register` accepts `{ "name", "email", "password" }` and returns
`202 Accepted` after sending a six-digit code. It does not create a `users` row.
Confirm it with `POST /api/auth/confirm-otp` and `{ "email", "otp" }`; only a
successful confirmation creates the account and returns the normal access token and
refresh cookie.

Pending registration state is now cached in Redis rather than stored in a database table.
The hash stores the password and OTP hashes, plus the attempt count. Codes expire after
`REGISTRATION_OTP_EXPIRES_IN_MINUTES` (10 by default) and are deleted when successfully
used or after the third incorrect entry.

## Forgot password

1. Call `POST /api/auth/forgot-password` with `{ "email" }`. The response is
   intentionally identical for registered and unregistered emails, preventing account
   enumeration.
2. Submit the emailed code to `POST /api/auth/verify-forgot-password-otp` with
   `{ "email", "otp" }`. After at most three attempts, a valid code produces a
   short-lived `resetToken`.
3. Call `POST /api/auth/reset-password` with `{ "resetToken", "password" }`.
   This endpoint deliberately accepts neither an email nor a user ID. The token is
   random, stored only as a hash in Redis, expires quickly, and is consumed atomically
   on its first use. A successful reset revokes all existing refresh-token sessions.

Keep the `resetToken` only in frontend memory; do not put it in a URL, local storage,
or logs.

## curl Testing

See `examples/auth-curl.md`.

## Frontend Axios

See `examples/frontend-auth-axios.js`.

Make sure the frontend sends cookies:

```js
axios.defaults.withCredentials = true;
```

For a Vite frontend, add the same Google Web client ID to the frontend `.env`:

```env
VITE_GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
```




Use `VITE_GOOGLE_CLIENT_ID` in the frontend Google button/library. Use `GOOGLE_CLIENT_ID` in this backend. They normally contain the same Web client ID, but they live in different apps because Vite only exposes env vars prefixed with `VITE_`.

Google sign-in flow:

1. Frontend gets a Google ID token from Google.
2. Frontend calls `POST /api/auth/google` with `{ "idToken": "..." }`.
3. Backend verifies the token with Google using `GOOGLE_CLIENT_ID`.
4. Backend creates or links the user, then returns PhoneClub's own `accessToken` and refresh cookie.

Create the Google client ID:

1. Open Google Cloud Console's OAuth clients page.
2. Create or select a project.
3. Create an OAuth client with application type `Web application`.
4. Add your frontend origin to Authorized JavaScript origins, for example `http://localhost:5173`.
5. Copy the client ID that looks like `1234567890-abc.apps.googleusercontent.com`.

## Protecting Routes

```js
const authMiddleware = require("../middleware/auth.middleware");

router.get("/profile", authMiddleware, controller);
```
