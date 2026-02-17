import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const logoutSchema = z.object({
  sessionId: z.string().min(1)
});

export const registerSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  role: z.string().min(1).optional(),
  fullName: z.string().optional(),
  site_id: z.coerce.number().int().positive().optional().nullable()
});

export const validateSchema = z.object({
  sessionId: z.string().min(1).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1)
});

export const requestOtpSchema = z.object({
  email: z.string().email()
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{4,8}$/)
});

export const adminResetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(1)
});

export const resetPasswordWithOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{4,8}$/),
  newPassword: z.string().min(1)
});
