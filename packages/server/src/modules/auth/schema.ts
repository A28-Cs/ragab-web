/**
 * Auth input schemas (§14). All `.strict()` so unknown keys are rejected — this is the
 * mass-assignment defense (§15): a client cannot smuggle `isStaff` or `roleId` into a
 * registration payload. Egyptian phone format matches the existing frontend validator.
 */
import { z } from 'zod';

export const egyptianPhone = z
  .string()
  .trim()
  .regex(/^01[0125]\d{8}$/, 'Invalid Egyptian phone number');

export const passwordField = z.string().min(8, 'Password must be at least 8 characters').max(200);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: egyptianPhone,
    email: z.string().trim().email().max(200).optional(),
    password: passwordField,
    defaultVillage: z.string().trim().max(120).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    // Accepts either a phone number or an email; login() branches on shape.
    identifier: z.string().trim().min(3).max(200),
    password: z.string().min(1).max(200),
  })
  .strict();

export const requestPasswordResetSchema = z.object({ phone: egyptianPhone }).strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(400),
    password: passwordField,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: passwordField,
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    code: z.string().regex(/^\d{4,8}$/),
  })
  .strict();

export const revokeSessionSchema = z.object({ sessionId: z.string().min(1).max(64) }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const providerLoginSchema = z.object({
  idToken: z.string().min(1),
  provider: z.enum(['google', 'apple']),
}).strict();
export type ProviderLoginInput = z.infer<typeof providerLoginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(10).max(400),
}).strict();

export const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(200),
}).strict();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  defaultVillage: z.string().trim().max(120).optional(),
  avatar: z.string().max(1000).optional(),
  houseImage: z.string().max(1000).optional(),
  dateOfBirth: z.string().max(20).optional(),
  preferredLanguage: z.enum(["ar", "en"]).optional(),
}).strict();

export const deleteAccountSchema = z
  .object({
    reauthPassword: z.string().min(1).max(200),
    // TOTP or recovery code; required when the account has 2FA enabled.
    code: z.string().min(4).max(20).optional(),
  })
  .strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const twoFactorEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const twoFactorDisableSchema = z.object({ password: z.string().min(1).max(200) }).strict();
export const twoFactorVerifyLoginSchema = z.object({
  challenge: z.string().min(10).max(400),
  code: z.string().min(4).max(20),
}).strict();
