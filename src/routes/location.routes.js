import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { allowRoute } from '../middleware/rbac.js';
import * as Location from '../controllers/location.controller.js';
import { validate } from '../middleware/validate.js';
import { listLocationsQuery, createLocationBody, updateLocationBody, locationIdParam, createWithDevicesBody, updateWithDevicesBody } from '../schemas/location.schemas.js';

const router = Router();

router.get('/', requireAuth, allowRoute('locations'), validate(listLocationsQuery, 'query'), Location.list);
router.get('/with-devices', requireAuth, allowRoute('locations'), validate(listLocationsQuery, 'query'), Location.listWithDevices);
router.post('/', requireAuth, allowRoute('locations'), validate(createLocationBody), Location.create);
router.get('/:id', requireAuth, allowRoute('locations'), validate(locationIdParam, 'params'), Location.get);
router.get('/:id/with-devices', requireAuth, allowRoute('locations'), validate(locationIdParam, 'params'), Location.getWithDevices);
router.patch('/:id', requireAuth, allowRoute('locations'), validate(locationIdParam, 'params'), validate(updateLocationBody), Location.update);
router.delete('/:id', requireAuth, allowRoute('locations'), validate(locationIdParam, 'params'), Location.remove);
router.post('/create-with-devices', requireAuth, allowRoute('locations'), validate(createWithDevicesBody), Location.createWithDevices);
router.patch('/:id/update-with-devices', requireAuth, allowRoute('locations'), validate(locationIdParam, 'params'), validate(updateWithDevicesBody), Location.updateWithDevices);

export default router;
