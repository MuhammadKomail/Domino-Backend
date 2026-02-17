import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { allowRoute } from '../middleware/rbac.js';
import * as Roles from '../controllers/roles.controller.js';
import { validate } from '../middleware/validate.js';
import { roleIdParamSchema, roleCreateSchema, roleUpdateSchema } from '../schemas/roles.schemas.js';

const router = Router();

router.get('/', requireAuth, allowRoute('roles:manage'), Roles.list);
router.get('/:id', requireAuth, allowRoute('roles:manage'), validate(roleIdParamSchema, 'params'), Roles.get);
router.post('/', requireAuth, allowRoute('roles:manage'), validate(roleCreateSchema), Roles.create);
router.patch('/:id', requireAuth, allowRoute('roles:manage'), validate(roleIdParamSchema, 'params'), validate(roleUpdateSchema), Roles.update);
router.put('/:id', requireAuth, allowRoute('roles:manage'), validate(roleIdParamSchema, 'params'), validate(roleUpdateSchema), Roles.update);
router.delete('/:id', requireAuth, allowRoute('roles:manage'), validate(roleIdParamSchema, 'params'), Roles.remove);

export default router;
