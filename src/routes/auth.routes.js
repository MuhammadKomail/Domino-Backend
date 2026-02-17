import { Router } from 'express';
import * as Auth from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, logoutSchema, registerSchema, validateSchema, changePasswordSchema, requestOtpSchema, verifyOtpSchema, adminResetPasswordSchema, resetPasswordWithOtpSchema } from '../schemas/auth.schemas.js';
import { requireAuth } from '../middleware/authz.js';

const router = Router();

router.post('/login', validate(loginSchema), Auth.login);
router.post('/logout', validate(logoutSchema), Auth.logout);
router.post('/register', validate(registerSchema), Auth.register);
router.post('/validate', validate(validateSchema), Auth.validate);
router.get('/me', requireAuth, Auth.me);
router.post('/change-password', requireAuth, validate(changePasswordSchema), Auth.changePassword);
router.post('/request-otp', validate(requestOtpSchema), Auth.requestOtp);
router.post('/verify-otp', validate(verifyOtpSchema), Auth.verifyOtp);
router.post('/reset-password', validate(resetPasswordWithOtpSchema), Auth.resetPasswordWithOtp);
router.post('/admin-reset-password', requireAuth, validate(adminResetPasswordSchema), Auth.adminResetPassword);
router.post('/reset-password-direct', validate(adminResetPasswordSchema), Auth.resetPasswordDirect);

export default router;
