import { Router } from 'express';
import authRoutes from './auth.routes.js';
import tableRoutes from './table.routes.js';
import staticRoutes from './static.routes.js';
import tablesRoutes from './tables.routes.js';
import docsRoutes from './docs.routes.js';
import rolesRoutes from './roles.routes.js';
import locationRoutes from './location.routes.js';
import companyRoutes from './company.routes.js';
import deviceRoutes from './device.routes.js';
import usersRoutes from './users.routes.js';
import sitesRoutes from './sites.routes.js';

const router = Router();

router.use('/api/auth', authRoutes);
router.use('/api/tables', tablesRoutes);
router.use('/api/table', tableRoutes);
router.use('/api/roles', rolesRoutes);
router.use('/api/users', usersRoutes);
router.use('/api/sites', sitesRoutes);
router.use('/api/locations', locationRoutes);
router.use('/api/companies', companyRoutes);
router.use('/api/devices', deviceRoutes);
router.use('/docs', docsRoutes);
router.use('/', staticRoutes);

export default router;
