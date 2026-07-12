# Auth API curl Examples

Use a cookie jar so curl stores and sends the HttpOnly refresh-token cookie.

```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"User Name","email":"test@example.com","password":"StrongPassword123!"}'
```

The register response is `202 Accepted` and emails a six-digit code; it does not
create a user or log the user in. Confirm it to create the account:

```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/confirm-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'
```

Copy the `accessToken` from the JSON response and use it for protected APIs:

```bash
curl -i http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Login:

```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"StrongPassword123!"}'
```

Google login. Send the Google ID token returned by the frontend Google sign-in button:

```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential":"GOOGLE_CREDENTIAL_FROM_FRONTEND"}'
```

Refresh the session. This rotates the refresh token cookie and returns a new access token:

```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/auth/refresh
```

Logout revokes the current refresh token and clears the cookie:

```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/auth/logout
```

Postman: enable the cookie jar, send requests to the same host, and add
`Authorization: Bearer <accessToken>` for `GET /api/auth/me` and other protected routes.

Cart APIs also need the access token:

```bash
curl -i http://localhost:5000/api/cart \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

```bash
curl -i -X POST http://localhost:5000/api/cart/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"PRODUCT_ID","quantity":1}'
```

```bash
curl -i -X PATCH http://localhost:5000/api/cart/items/PRODUCT_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":2}'
```

```bash
curl -i -X DELETE http://localhost:5000/api/cart/items/PRODUCT_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
