/* Generates docs/RentNest.postman_collection.json and docs/openapi.json from src/docs/openapi.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { openapi } from '../src/docs/openapi';

type AnyObj = Record<string, any>;
const paths = openapi.paths as AnyObj;
const folders = new Map<string, AnyObj[]>();

for (const [path, methods] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(methods as AnyObj)) {
    const op = operation as AnyObj;
    const tag: string = op.tags[0];
    const url = path.replace(/\{(\w+)\}/g, '{{$1}}');
    const queryParams = (op.parameters ?? []).filter((p: AnyObj) => p.in === 'query');
    const secured = Array.isArray(op.security) ? op.security.length > 0 : false;
    const example = op.requestBody?.content?.['application/json']?.example;

    const item: AnyObj = {
      name: `${method.toUpperCase()} ${path} - ${op.summary}`,
      request: {
        method: method.toUpperCase(),
        header: [...(example || op.requestBody ? [{ key: 'Content-Type', value: 'application/json' }] : [])],
        url: {
          raw: `{{baseUrl}}${url}`,
          host: ['{{baseUrl}}'],
          path: url.split('/').filter(Boolean),
          query: queryParams.map((p: AnyObj) => ({ key: p.name, value: '', disabled: true })),
        },
        ...(secured ? { auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] } } : { auth: { type: 'noauth' } }),
        ...(op.requestBody ? { body: { mode: 'raw', raw: JSON.stringify(example ?? {}, null, 2), options: { raw: { language: 'json' } } } } : {}),
        ...(op.description ? { description: op.description } : {}),
      },
    };

    // Save the JWT automatically after login / register.
    if (path === '/api/auth/login' || path === '/api/auth/register') {
      item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: ["const b = pm.response.json();", "if (b.success && b.data && b.data.token) { pm.collectionVariables.set('token', b.data.token); }"] } }];
    }
    // Remember ids returned by create endpoints so follow-up requests work with one click.
    if (path === '/api/rentals' && method === 'post') {
      item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: ["const b = pm.response.json();", "if (b.success) { pm.collectionVariables.set('rentalRequestId', b.data.id); pm.collectionVariables.set('id', b.data.id); }"] } }];
    }
    if (path === '/api/payments/create') {
      item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: ["const b = pm.response.json();", "if (b.success) { pm.collectionVariables.set('sessionId', b.data.sessionId); pm.collectionVariables.set('paymentId', b.data.payment.id); console.log('Open to pay:', b.data.checkoutUrl); }"] } }];
    }
    (folders.get(tag) ?? folders.set(tag, []).get(tag)!).push(item);
  }
}

const collection = {
  info: {
    name: 'RentNest API',
    description: 'Generated from the OpenAPI spec. Login first - the token is stored automatically. Admin: admin@rentnest.com / Admin@12345.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [...folders.entries()].map(([name, item]) => ({ name, item })),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000' },
    { key: 'token', value: '' },
    { key: 'id', value: '' },
    { key: 'rentalRequestId', value: '' },
    { key: 'paymentId', value: '' },
    { key: 'sessionId', value: '' },
  ],
};

mkdirSync('docs', { recursive: true });
writeFileSync('docs/RentNest.postman_collection.json', JSON.stringify(collection, null, 2));
writeFileSync('docs/openapi.json', JSON.stringify(openapi, null, 2));
console.log(`Wrote docs/RentNest.postman_collection.json (${[...folders.values()].flat().length} requests) and docs/openapi.json`);
