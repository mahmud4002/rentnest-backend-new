import { Router } from 'express';
import adminRoutes from '../modules/admin/admin.routes';
import authRoutes from '../modules/auth/auth.routes';
import categoryRoutes from '../modules/category/category.routes';
import docsRoutes from '../docs/docs.routes';
import landlordRoutes from '../modules/landlord/landlord.routes';
import paymentRoutes from '../modules/payment/payment.routes';
import reviewRoutes from '../modules/review/review.routes';
import propertyRoutes from '../modules/property/property.routes';
import rentalRoutes from '../modules/rental/rental.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'RentNest API is healthy',
    data: { uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() },
  });
});

router.use('/docs', docsRoutes);
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/properties', propertyRoutes);
router.use('/landlord', landlordRoutes);
router.use('/rentals', rentalRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);

export default router;
