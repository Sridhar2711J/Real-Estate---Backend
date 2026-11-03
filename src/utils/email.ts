import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

export interface SendOtpEmailParams {
  to: string;
  name?: string;
  otp: string;
}

/**
 * Creates an elegant HTML email template for password reset OTP
 */
export const createOtpEmailTemplate = (name: string, otp: string): string => {
  const displayName = name ? name.trim() : 'User';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset OTP - Real Estate</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #111827; padding: 24px 32px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      Real <span style="color: #e76f51;">Estate</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: rgba(231, 111, 81, 0.2); color: #e76f51; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">
                      Security Verification
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 24px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;">
                Password Reset Request
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Hello <strong>${displayName}</strong>, we received a request to reset the password for your Real Estate account. Use the verification code below to complete your password reset:
              </p>

              <!-- OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: #fef0eb; border: 2px dashed #e76f51; border-radius: 12px; padding: 18px 36px; text-align: center;">
                      <div style="font-size: 11px; font-weight: 700; color: #e76f51; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">
                        One-Time Password (OTP)
                      </div>
                      <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #e76f51; font-family: 'Courier New', Courier, monospace;">
                        ${otp}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Expiry Note & Warnings -->
              <div style="background-color: #f1f5f9; border-left: 4px solid #e76f51; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #334155;">
                  ⏱️ <strong>This code expires in 10 minutes.</strong> Never share this code with anyone. Real Estate support will never ask for your verification code.
                </p>
              </div>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                If you did not initiate this request, you can safely ignore this email. Your account credentials remain secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.4;">
                &copy; ${new Date().getFullYear()} Real Estate Platform. All rights reserved.<br />
                This is an automated security notification. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Transporter instance
 */
const getTransporter = () => {
  return nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE,
    auth: env.EMAIL_USER && env.EMAIL_PASS ? {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    } : undefined,
  });
};

/**
 * Sends a password reset OTP email
 */
export const sendPasswordResetEmail = async ({
  to,
  name,
  otp,
}: SendOtpEmailParams): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> => {
  // Always log OTP for easy local testing & debugging
  logger.info(`🔐 [PASSWORD RESET OTP] For ${to}: >>> ${otp} <<< (Valid for 10 minutes)`);

  // If no email credentials configured, log and return simulation
  if (!env.EMAIL_USER || !env.EMAIL_PASS || env.EMAIL_USER === 'your-email@gmail.com') {
    logger.warn('📧 SMTP credentials not configured in .env. OTP was logged above for development.');
    return { success: true, simulated: true };
  }

  try {
    const transporter = getTransporter();
    const html = createOtpEmailTemplate(name || '', otp);

    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: `${otp} is your Real Estate verification code`,
      html,
      text: `Hello ${name || 'User'}, your Real Estate password reset verification code is: ${otp}. It expires in 10 minutes.`,
    });

    logger.info(`📧 Password reset email dispatched to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`❌ Failed to send password reset email via SMTP:`, error);
    // Still resolve so the user in development can use the OTP logged to console
    return { success: true, simulated: true };
  }
};

