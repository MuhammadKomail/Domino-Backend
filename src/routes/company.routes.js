import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { allowRoute } from '../middleware/rbac.js';
import * as Company from '../controllers/company.controller.js';
import { validate } from '../middleware/validate.js';
import { listCompaniesQuery, createCompanyBody, updateCompanyBody, companyIdParam, companyLocationIdParam } from '../schemas/company.schemas.js';

const router = Router();

router.get('/', requireAuth, allowRoute('companies'), validate(listCompaniesQuery, 'query'), Company.list);
router.get('/all/sites-with-devices', requireAuth, allowRoute('locations'), Company.listAllCompaniesWithSitesDevices);
router.get('/:id/overview', requireAuth, allowRoute('dashboard'), validate(companyIdParam, 'params'), Company.getCompanyOverview);
router.get('/:id/locations/:locationId/overview', requireAuth, allowRoute('dashboard'), validate(companyLocationIdParam, 'params'), Company.getCompanyLocationOverview);
router.post('/', requireAuth, allowRoute('companies'), validate(createCompanyBody), Company.create);
router.get('/:id', requireAuth, allowRoute('companies'), validate(companyIdParam, 'params'), Company.get);
router.patch('/:id', requireAuth, allowRoute('companies'), validate(companyIdParam, 'params'), validate(updateCompanyBody), Company.update);
router.delete('/:id', requireAuth, allowRoute('companies'), validate(companyIdParam, 'params'), Company.remove);
router.get('/:id/locations', requireAuth, allowRoute('locations'), validate(companyIdParam, 'params'), Company.listCompanyLocations);
router.get('/:id/sites-with-devices', requireAuth, allowRoute('locations'), validate(companyIdParam, 'params'), Company.listCompanySitesWithDevices);

export default router;
