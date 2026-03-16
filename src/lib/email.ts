import nodemailer from 'nodemailer';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_TEMPLATES, renderTemplate, getTemplateVariables } from '@/lib/email-templates';
import type { EmailTemplateType } from '@/types';

function getTransporter() {
  if (process.env.RESEND_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY,
      },
    });
  }
  return null;
}

const FROM_ADDRESS = `"予約システム" <noreply@${process.env.EMAIL_DOMAIN || 'example.com'}>`;

async function sendEmail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`=== EMAIL ===\nTo: ${to}\nSubject: ${subject}\n${html}\n=============`);
    return;
  }
  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
}

/**
 * Fetch a user's template by type, or fall back to default
 */
async function getTemplate(userId: string, type: EmailTemplateType, templateId?: string | null) {
  const supabase = createServiceRoleClient();

  if (templateId) {
    const { data } = await supabase
      .from('scheduling_email_templates')
      .select('subject, body_html')
      .eq('id', templateId)
      .single();
    if (data) return data;
  }

  // Fall back to user's default template of this type
  const { data } = await supabase
    .from('scheduling_email_templates')
    .select('subject, body_html')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('is_default', true)
    .single();

  if (data) return data;

  // Ultimate fallback: hardcoded default
  const def = DEFAULT_TEMPLATES[type];
  return { subject: def.subject, body_html: def.body_html };
}

export interface BookingEmailParams {
  guestName: string;
  guestEmail: string;
  hostName: string;
  hostEmail: string;
  hostUserId: string;
  eventTypeName: string;
  startTime: string;
  endTime: string;
  locationType: 'online' | 'offline';
  meetingUrl?: string | null;
  offlineLocation?: string | null;
  manageToken?: string | null;
  templateId?: string | null;
}

export async function sendBookingConfirmation(params: BookingEmailParams) {
  const vars = getTemplateVariables(params);
  const template = await getTemplate(params.hostUserId, 'confirmation', params.templateId);
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body_html, vars);

  await sendEmail(params.guestEmail, subject, html);
  await sendEmail(params.hostEmail, `新しい予約: ${params.guestName} - ${subject}`, html);
}

export async function sendCancellationEmail(params: BookingEmailParams) {
  const vars = getTemplateVariables(params);
  const template = await getTemplate(params.hostUserId, 'cancellation', params.templateId);
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body_html, vars);

  await sendEmail(params.guestEmail, subject, html);
  await sendEmail(params.hostEmail, `キャンセル: ${params.guestName} - ${subject}`, html);
}

export async function sendRescheduleEmail(params: BookingEmailParams) {
  const vars = getTemplateVariables(params);
  const template = await getTemplate(params.hostUserId, 'reschedule', params.templateId);
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body_html, vars);

  await sendEmail(params.guestEmail, subject, html);
  await sendEmail(params.hostEmail, `日時変更: ${params.guestName} - ${subject}`, html);
}

export async function sendBookingReminder(params: BookingEmailParams) {
  const vars = getTemplateVariables(params);
  const template = await getTemplate(params.hostUserId, 'reminder', params.templateId);
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body_html, vars);

  await sendEmail(params.guestEmail, subject, html);
}
