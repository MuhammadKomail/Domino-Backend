import { Router } from 'express';
import * as Static from '../controllers/static.controller.js';

const router = Router();

router.get(['/', '/index.html'], Static.index);
router.get(['/login', '/login.html'], Static.loginPage);

export default router;
