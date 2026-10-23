# RentNest 🏠 - Backend API

Rental property marketplace. Landlords list properties and answer rental requests, tenants browse, request, **pay with Stripe** and review, admins moderate the platform.

**Stack:** Node.js · Express 4 · TypeScript · PostgreSQL · Prisma · JWT · Zod · Stripe Checkout

## Mandatory requirements checklist

| # | Requirement | Where |
|---|---|---|
| 1 | API documentation | Swagger UI at `/api/docs` · `docs/openapi.json` · `docs/RentNest.postman_collection.json` |
| 2 | Consistent errors `{ success, message, errorDetails }` | `src/middlewares/errorHandler.ts` |
| 3 | 20+ meaningful commits | `git log --oneline` |
| 4 | Server-side validation on all endpoints | Zod schemas in every `*.validation.ts`, applied by `src/middlewares/validate.ts` |
| 5 | Admin credentials | see below |
| 6 | Real payment integration | Stripe Checkout (test mode) in `src/modules/payment` |

### Admin credentials (created by `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@rentnest.com` | `Admin@12345` |
| Landlord (demo) | `landlord@rentnest.com` | `Demo@12345` |
| Tenant (demo) | `tenant@rentnest.com` | `Demo@12345` |

Change them with `ADMIN_EMAIL` / `ADMIN_PASSWORD` before seeding. For the deployed server, replace these values with the live admin login you seeded.

## Run locally

```bash
npm install
cp .env.example .env        # fill DATABASE_URL, JWT_SECRET, Stripe keys
npx prisma migrate dev --name init   # creates tables (or: npm run db:push)
npm run seed                # admin + categories + demo data
npm run dev                 # http://localhost:5000  (docs: /api/docs)
```

Regenerate the docs after changing endpoints: `npm run docs:generate`.

## Payment flow (Stripe)

```
Tenant submits request ──► Landlord APPROVES ──► POST /api/payments/create
                                                      │  returns checkoutUrl
                                                      ▼
                                      Tenant pays on Stripe (test card 4242 4242 4242 4242)
                                                      │
                 ┌────────────────────────────────────┴───────────────┐
                 ▼                                                    ▼
   Stripe webhook  POST /api/payments/webhook          success redirect / POST /api/payments/confirm
                 └──────────────► payment COMPLETED, rental ACTIVE, property RENTED  (idempotent)
```

* Rental status: `PENDING → APPROVED | REJECTED`, `APPROVED → ACTIVE` (only by a verified payment), `ACTIVE → COMPLETED` (landlord), tenant may `CANCEL` while PENDING/APPROVED.
* Amount is calculated on the server from the price snapshot taken at request time (`monthlyRent × durationMonths`); the client can never send an amount.
* The paid amount and currency returned by Stripe are compared with the expected ones before a rental is activated.
* Webhook: add `https://<your-host>/api/payments/webhook` in the Stripe Dashboard (events `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`), or locally run `stripe listen --forward-to localhost:5000/api/payments/webhook` and copy the `whsec_...` into `.env`.
* Even without a webhook, `GET /api/payments/success?session_id=...` and `POST /api/payments/confirm` ask Stripe directly for the truth.

## Endpoints (40)

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register` · `POST /api/auth/login` · `GET/PATCH /api/auth/me` · `PATCH /api/auth/change-password` |
| Public | `GET /api/properties` (search, location, type, price range, amenities, bedrooms, sort, pagination) · `GET /api/properties/:id` · `GET /api/categories` · `GET /api/reviews?propertyId=` |
| Landlord | `GET/POST /api/landlord/properties` · `PUT/DELETE /api/landlord/properties/:id` · `PATCH .../:id/status` · `GET /api/landlord/requests` · `PATCH /api/landlord/requests/:id` · `GET /api/landlord/rental-history` · `GET /api/landlord/reviews` |
| Tenant | `POST/GET /api/rentals` · `GET /api/rentals/:id` · `PATCH /api/rentals/:id/cancel` · `POST /api/reviews` |
| Payments | `POST /api/payments/create` · `POST /api/payments/confirm` · `POST /api/payments/webhook` · `GET /api/payments/success` · `GET /api/payments/cancel` · `GET /api/payments` · `GET /api/payments/:id` |
| Admin | `GET /api/admin/stats` · `GET /api/admin/users` · `PATCH /api/admin/users/:id` · `GET /api/admin/properties` · `PATCH /api/admin/properties/:id/status` · `GET /api/admin/rentals` · `GET /api/admin/payments` · `POST/PUT/DELETE /api/admin/categories` |

## Response format

```jsonc
// success
{ "success": true, "message": "Properties fetched", "data": [ ... ], "meta": { "page": 1, "limit": 10, "total": 25, "totalPages": 3 } }

// error (every error, including 404, malformed JSON, bad token, DB conflicts, Stripe failures)
{ "success": false, "message": "Validation failed",
  "errorDetails": { "code": "VALIDATION_ERROR", "issues": [ { "field": "email", "location": "body", "message": "Email must be a valid email address" } ] } }
```

## Security & design notes

* Passwords hashed with bcrypt; JWT carries only id + role, and the user is re-read from the DB on every request, so a **ban takes effect immediately**.
* Role guards on every protected route; landlords can only touch their own properties/requests, tenants only their own rentals/payments.
* Approving a request locks the property row in a transaction, so two landlords' simultaneous approvals cannot double-book a property.
* Reviews: only the tenant of a `COMPLETED` rental, one review per rental (unique index).
* `helmet`, `cors`, body size limit, raw-body only on the webhook route.

## Deploy

**Render:** use `render.yaml` (Blueprint), set `DATABASE_URL`, `APP_URL`, Stripe keys. **Vercel:** import the repo, set the same variables; `vercel-build` generates the client and syncs the schema. Use a hosted Postgres (Neon / Supabase / Render Postgres). Remember to set `APP_URL` to the deployed URL (Stripe redirects there).
