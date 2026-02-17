import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { listTables } from '../controllers/table.controller.js';

const router = Router();

router.get('/', requireAuth, listTables);

export default router;
