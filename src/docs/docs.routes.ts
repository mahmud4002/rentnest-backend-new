import { Router } from 'express';
import { openapi } from './openapi';

const router = Router();

router.get('/openapi.json', (_req, res) => {
  res.json(openapi);
});

// Swagger UI loaded from a CDN so no extra runtime dependency is needed (works on Vercel too).
router.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>RentNest API Docs</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"/></head>
<body><div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui', persistAuthorization: true, deepLinking: true });</script>
</body></html>`);
});

export default router;
