import { Router } from 'express';
import { requireAuth } from '../middleware/authz.js';
import { allowRoute } from '../middleware/rbac.js';
import * as Device from '../controllers/device.controller.js';
import { validate } from '../middleware/validate.js';
import { listDevicesQuery, createDeviceBody, updateDeviceBody, deviceIdParam, deviceSerialParam, deviceSerialSettingIdParam, updateDeviceSettingBody, deviceOverviewQuery, deviceRangePagedQuery } from '../schemas/device.schemas.js';

const router = Router();

router.get('/', requireAuth, allowRoute('devices'), validate(listDevicesQuery, 'query'), Device.list);
router.post('/', requireAuth, allowRoute('devices'), validate(createDeviceBody), Device.create);
router.get('/:id', requireAuth, allowRoute('devices'), validate(deviceIdParam, 'params'), Device.get);
router.patch('/:id', requireAuth, allowRoute('devices'), validate(deviceIdParam, 'params'), validate(updateDeviceBody), Device.update);
router.delete('/:id', requireAuth, allowRoute('devices'), validate(deviceIdParam, 'params'), Device.remove);

// Dashboard/device page endpoints
router.get('/:deviceSerial/overview', requireAuth, allowRoute('dashboard'), validate(deviceSerialParam, 'params'), validate(deviceOverviewQuery, 'query'), Device.getOverviewBySerial);
router.get('/:deviceSerial/history', requireAuth, allowRoute('dashboard'), validate(deviceSerialParam, 'params'), validate(deviceRangePagedQuery, 'query'), Device.getHistoryBySerial);
router.get('/:deviceSerial/settings', requireAuth, allowRoute('dashboard'), validate(deviceSerialParam, 'params'), validate(deviceRangePagedQuery, 'query'), Device.getSettingsBySerial);
router.patch('/:deviceSerial/settings/:settingId', requireAuth, allowRoute('dashboard'), validate(deviceSerialSettingIdParam, 'params'), validate(updateDeviceSettingBody), Device.updateSettingBySerial);

export default router;
