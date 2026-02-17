import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { allowRoute } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as Users from '../controllers/users.controller.js';
import { listUsersQuery, createUserBody, updateUserBody, userIdParam } from '../schemas/users.schemas.js';

const router = Router();

router.get('/', requireAuth, allowRoute('users:list'), validate(listUsersQuery, 'query'), Users.list);
router.get('/:id', requireAuth, allowRoute('users:list'), validate(userIdParam, 'params'), Users.get);
router.post('/', requireAuth, allowRoute('users:create'), validate(createUserBody), Users.create);
router.patch('/:id', requireAuth, allowRoute('users:edit'), validate(userIdParam, 'params'), validate(updateUserBody), Users.update);
router.put('/:id', requireAuth, allowRoute('users:edit'), validate(userIdParam, 'params'), validate(updateUserBody), Users.update);
router.delete('/:id', requireAuth, allowRoute('users:edit'), validate(userIdParam, 'params'), Users.remove);

export default router;
