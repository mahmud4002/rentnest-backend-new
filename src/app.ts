import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProduction } from './config';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import routes from './routes';

const app = express();

app.set('trust proxy', 1);
// CSP is relaxed because /api/docs loads Swagger UI from a CDN; this API only serves JSON otherwise.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
if (process.env.NODE_ENV !== 'test') app.use(morgan(isProduction ? 'combined' : 'dev'));

// Stripe signs the RAW request body, so the webhook must be parsed as a Buffer
// BEFORE express.json() runs.
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Welcome to RentNest API',
    data: { docs: '/api/docs', health: '/api/health' },
  });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
