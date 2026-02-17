import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { allowRoute } from '../middleware/rbac.js';
import * as Sites from '../controllers/sites.controller.js';

const router = Router();

router.get('/', requireAuth, allowRoute('locations'), Sites.list);

export default router;
