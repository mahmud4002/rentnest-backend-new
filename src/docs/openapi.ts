/* OpenAPI 3.0 description of the RentNest API. Served at /api/docs and used to generate the Postman collection. */

type Json = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: Json, example?: Json) => ({
  required: true,
  content: { 'application/json': { schema, ...(example ? { example } : {}) } },
});
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
];
const q = (name: string, type = 'string', description?: string, extra: Json = {}) => ({ name, in: 'query', schema: { type, ...extra }, ...(description ? { description } : {}) });

const errors = (...codes: number[]) =>
  Object.fromEntries(
    codes.map((c) => [String(c), { description: { 400: 'Validation error', 401: 'Not authenticated', 403: 'Not allowed', 404: 'Not found', 409: 'Conflict', 502: 'Payment provider error', 503: 'Payments not configured' }[c] ?? 'Error', content: { 'application/json': { schema: ref('Error') } } }]),
  );
const ok = (description: string, status = '200') => ({ [status]: { description, content: { 'application/json': { schema: ref('Success') } } } });

type Op = { summary: string; tag: string; auth?: boolean; params?: Json[]; body?: Json; status?: string; errs?: number[]; description?: string };
const op = ({ summary, tag, auth = true, params, body, status = '200', errs = [], description }: Op) => ({
  tags: [tag],
  summary,
  ...(description ? { description } : {}),
  ...(auth ? { security: [{ bearerAuth: [] }] } : { security: [] }),
  ...(params ? { parameters: params } : {}),
  ...(body ? { requestBody: body } : {}),
  responses: { ...ok('Success', status), ...errors(...(body || params?.length ? [400] : []), ...(auth ? [401] : []), ...errs) },
});

const propertyBody = {
  title: 'Sunny 3-bed apartment in Gulshan', description: 'Spacious apartment with a lake view, close to schools.', address: 'Road 41, Gulshan 2',
  city: 'Dhaka', price: 450, bedrooms: 3, bathrooms: 2, areaSqft: 1650, amenities: ['wifi', 'parking'], images: ['https://example.com/a.jpg'], categoryId: '<categoryId>',
};

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'RentNest API',
    version: '1.0.0',
    description:
      'Rental property marketplace backend (Node.js, Express, TypeScript, PostgreSQL, Prisma, Stripe).\n\n' +
      '**All responses** use `{ success, message, data?, meta? }`; **all errors** use `{ success: false, message, errorDetails }`.\n\n' +
      '**Auth:** call `POST /api/auth/login`, then press *Authorize* and paste the token.\n\n' +
      '**Paying:** `POST /api/payments/create` returns a Stripe `checkoutUrl`. Open it and pay with the test card `4242 4242 4242 4242` (any future date, any CVC).',
  },
  servers: [{ url: '/', description: 'Current server' }],
  tags: ['Auth', 'Properties', 'Categories', 'Landlord', 'Rentals', 'Payments', 'Reviews', 'Admin'].map((name) => ({ name })),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Success: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' }, data: {}, meta: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } } },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errorDetails: { type: 'object', properties: { code: { type: 'string', example: 'VALIDATION_ERROR' }, issues: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, location: { type: 'string' }, message: { type: 'string' } } } } } },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': { post: op({ summary: 'Register as TENANT or LANDLORD', tag: 'Auth', auth: false, status: '201', errs: [409], body: jsonBody({ type: 'object', required: ['name', 'email', 'password', 'role'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, role: { type: 'string', enum: ['TENANT', 'LANDLORD'] }, phone: { type: 'string' } } }, { name: 'Rahim Uddin', email: 'rahim@example.com', password: 'Passw0rd123', role: 'TENANT', phone: '+8801712345678' }) }) },
    '/api/auth/login': { post: op({ summary: 'Login and receive a JWT', tag: 'Auth', auth: false, errs: [403], body: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } }, { email: 'admin@rentnest.com', password: 'Admin@12345' }) }) },
    '/api/auth/me': {
      get: op({ summary: 'Current user', tag: 'Auth' }),
      patch: op({ summary: 'Update profile', tag: 'Auth', body: jsonBody({ type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, avatarUrl: { type: 'string' } } }, { name: 'New Name' }) }),
    },
    '/api/auth/change-password': { patch: op({ summary: 'Change password', tag: 'Auth', body: jsonBody({ type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } }, { currentPassword: 'Passw0rd123', newPassword: 'NewPassw0rd456' }) }) },

    '/api/properties': { get: op({ summary: 'Browse available properties (search, filter, sort, paginate)', tag: 'Properties', auth: false, params: [...pageParams, q('search', 'string', 'Matches title, description, address or city'), q('location', 'string', 'City or address'), q('type', 'string', 'Category name, e.g. Apartment'), q('categoryId'), q('amenities', 'string', 'Comma separated; all must match, e.g. wifi,parking'), q('minPrice', 'number'), q('maxPrice', 'number'), q('bedrooms', 'integer', 'Minimum bedrooms'), q('bathrooms', 'integer', 'Minimum bathrooms'), q('sortBy', 'string', undefined, { enum: ['createdAt', 'price', 'bedrooms'] }), q('order', 'string', undefined, { enum: ['asc', 'desc'] })] }) },
    '/api/properties/{id}': { get: op({ summary: 'Property details with reviews and rating', tag: 'Properties', auth: false, params: [idParam], errs: [404] }) },
    '/api/categories': { get: op({ summary: 'List categories', tag: 'Categories', auth: false }) },

    '/api/landlord/properties': {
      get: op({ summary: 'My listings (any status)', tag: 'Landlord', errs: [403], params: [...pageParams, q('status', 'string', undefined, { enum: ['AVAILABLE', 'RENTED', 'UNAVAILABLE'] })] }),
      post: op({ summary: 'Create a listing', tag: 'Landlord', status: '201', errs: [403], body: jsonBody({ type: 'object', required: ['title', 'description', 'address', 'city', 'price', 'categoryId'] }, propertyBody) }),
    },
    '/api/landlord/properties/{id}': {
      put: op({ summary: 'Update my listing (partial fields allowed)', tag: 'Landlord', errs: [403, 404], params: [idParam], body: jsonBody({ type: 'object' }, { price: 480 }) }),
      delete: op({ summary: 'Remove my listing (blocked if it has rental history)', tag: 'Landlord', errs: [403, 404, 409], params: [idParam] }),
    },
    '/api/landlord/properties/{id}/status': { patch: op({ summary: 'Set availability (AVAILABLE / UNAVAILABLE)', tag: 'Landlord', errs: [403, 404, 409], params: [idParam], body: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['AVAILABLE', 'UNAVAILABLE'] } } }, { status: 'UNAVAILABLE' }) }) },
    '/api/landlord/requests': { get: op({ summary: 'Rental requests for my properties', tag: 'Landlord', errs: [403], params: [...pageParams, q('status', 'string', undefined, { enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] }), q('propertyId')] }) },
    '/api/landlord/requests/{id}': { patch: op({ summary: 'Approve / reject a PENDING request, or complete an ACTIVE rental', tag: 'Landlord', errs: [403, 404, 409], params: [idParam], body: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED', 'COMPLETED'] }, landlordNote: { type: 'string' } } }, { status: 'APPROVED', landlordNote: 'Welcome!' }) }) },
    '/api/landlord/rental-history': { get: op({ summary: 'Active and completed rentals of my properties', tag: 'Landlord', errs: [403], params: pageParams }) },
    '/api/landlord/reviews': { get: op({ summary: 'Reviews on my properties', tag: 'Landlord', errs: [403], params: pageParams }) },

    '/api/rentals': {
      post: op({ summary: 'Submit a rental request (tenant)', tag: 'Rentals', status: '201', errs: [403, 404, 409], body: jsonBody({ type: 'object', required: ['propertyId', 'moveInDate', 'durationMonths'], properties: { propertyId: { type: 'string', format: 'uuid' }, moveInDate: { type: 'string', format: 'date' }, durationMonths: { type: 'integer', minimum: 1, maximum: 36 }, message: { type: 'string' } } }, { propertyId: '<propertyId>', moveInDate: '2026-12-01', durationMonths: 6, message: 'I would love to rent this.' }) }),
      get: op({ summary: 'My rental requests (landlord: requests on my properties)', tag: 'Rentals', params: [...pageParams, q('status')] }),
    },
    '/api/rentals/{id}': { get: op({ summary: 'Rental request details', tag: 'Rentals', errs: [403, 404], params: [idParam] }) },
    '/api/rentals/{id}/cancel': { patch: op({ summary: 'Cancel my PENDING/APPROVED request', tag: 'Rentals', errs: [403, 404, 409], params: [idParam] }) },

    '/api/payments/create': { post: op({ summary: 'Create a Stripe Checkout session for an APPROVED rental', tag: 'Payments', status: '201', errs: [403, 404, 409, 502, 503], description: 'Returns `checkoutUrl`. Open it in a browser to pay.', body: jsonBody({ type: 'object', required: ['rentalRequestId'], properties: { rentalRequestId: { type: 'string', format: 'uuid' } } }, { rentalRequestId: '<rentalRequestId>' }) }) },
    '/api/payments/confirm': { post: op({ summary: 'Verify a payment with Stripe and activate the rental', tag: 'Payments', errs: [403, 404, 502, 503], body: jsonBody({ type: 'object', properties: { sessionId: { type: 'string' }, paymentId: { type: 'string', format: 'uuid' } } }, { sessionId: 'cs_test_...' }) }) },
    '/api/payments/webhook': { post: { tags: ['Payments'], summary: 'Stripe webhook (signature verified, called by Stripe)', security: [], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...ok('Processed'), ...errors(400, 503) } } },
    '/api/payments/success': { get: op({ summary: 'Stripe success redirect (verifies with Stripe)', tag: 'Payments', auth: false, errs: [404], params: [{ name: 'session_id', in: 'query', required: true, schema: { type: 'string' } }] }) },
    '/api/payments/cancel': { get: op({ summary: 'Stripe cancel redirect', tag: 'Payments', auth: false, params: [q('payment_id')] }) },
    '/api/payments': { get: op({ summary: 'Payment history', tag: 'Payments', params: [...pageParams, q('status', 'string', undefined, { enum: ['PENDING', 'COMPLETED', 'FAILED'] }), q('provider')] }) },
    '/api/payments/{id}': { get: op({ summary: 'Payment details / status', tag: 'Payments', errs: [403, 404], params: [idParam] }) },

    '/api/reviews': {
      get: op({ summary: 'List reviews (filter by propertyId)', tag: 'Reviews', auth: false, params: [...pageParams, q('propertyId')] }),
      post: op({ summary: 'Review a COMPLETED rental (once)', tag: 'Reviews', status: '201', errs: [403, 404, 409], body: jsonBody({ type: 'object', required: ['rentalRequestId', 'rating', 'comment'], properties: { rentalRequestId: { type: 'string', format: 'uuid' }, rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' } } }, { rentalRequestId: '<rentalRequestId>', rating: 5, comment: 'Great place and a helpful landlord.' }) }),
    },

    '/api/admin/stats': { get: op({ summary: 'Platform statistics', tag: 'Admin', errs: [403] }) },
    '/api/admin/users': { get: op({ summary: 'All users', tag: 'Admin', errs: [403], params: [...pageParams, q('role'), q('status'), q('search')] }) },
    '/api/admin/users/{id}': { patch: op({ summary: 'Ban / unban a user', tag: 'Admin', errs: [403, 404], params: [idParam], body: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ACTIVE', 'BANNED'] } } }, { status: 'BANNED' }) }) },
    '/api/admin/properties': { get: op({ summary: 'All properties (any status)', tag: 'Admin', errs: [403], params: [...pageParams, q('status')] }) },
    '/api/admin/properties/{id}/status': { patch: op({ summary: 'Moderate: set property AVAILABLE / UNAVAILABLE', tag: 'Admin', errs: [403, 404, 409], params: [idParam], body: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['AVAILABLE', 'UNAVAILABLE'] } } }, { status: 'UNAVAILABLE' }) }) },
    '/api/admin/rentals': { get: op({ summary: 'All rental requests', tag: 'Admin', errs: [403], params: [...pageParams, q('status')] }) },
    '/api/admin/payments': { get: op({ summary: 'All payments', tag: 'Admin', errs: [403], params: [...pageParams, q('status')] }) },
    '/api/admin/categories': { post: op({ summary: 'Create category', tag: 'Admin', status: '201', errs: [403, 409], body: jsonBody({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } }, { name: 'Penthouse', description: 'Top-floor luxury units' }) }) },
    '/api/admin/categories/{id}': {
      put: op({ summary: 'Update category', tag: 'Admin', errs: [403, 404, 409], params: [idParam], body: jsonBody({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } }, { name: 'Penthouse Suite' }) }),
      delete: op({ summary: 'Delete category (blocked while in use)', tag: 'Admin', errs: [403, 404, 409], params: [idParam] }),
    },
  },
};
