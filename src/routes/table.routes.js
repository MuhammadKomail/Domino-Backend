import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import * as Table from '../controllers/table.controller.js';
import { validate } from '../middleware/validate.js';
import { tableParamSchema, insertSchema, updateSchema, deleteSchema } from '../schemas/table.schemas.js';
import { allowTable } from '../middleware/rbac.js';

const router = Router();

router.get('/', requireAuth, Table.listTables);
router.get('/:name', requireAuth, validate(tableParamSchema, 'params'), allowTable(), Table.getTable);
router.post('/:name/insert', requireAuth, validate(tableParamSchema, 'params'), allowTable(), validate(insertSchema), Table.insertRecord);
router.post('/:name/update', requireAuth, validate(tableParamSchema, 'params'), allowTable(), validate(updateSchema), Table.updateRecord);
router.post('/:name/delete', requireAuth, validate(tableParamSchema, 'params'), allowTable(), validate(deleteSchema), Table.deleteRecord);

export default router;
