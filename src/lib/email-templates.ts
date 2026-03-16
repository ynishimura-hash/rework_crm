import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { EmailTemplateType } from '@/types';

interface DefaultTemplate {
  name: string;
  subject: string;
  body_html: string;
}

export const DEFAULT_TEMPLATES: Record<EmailTemplateType, DefaultTemplate> = {
  confirmation: {
    name: 'デフォルト確認メール',
    subject: '予約確定: {{eventTypeName}} - {{date}}',
    body_html: textToHtml(`予約が確定しました

予約タイプ: {{eventTypeName}}
日時: {{dateTime}}
{{locationInfo}}
ホスト: {{hostName}}
ゲスト: {{guestName}} ({{guestEmail}})

日時を変更する場合: {{rescheduleUrl}}
キャンセルする場合: {{cancelUrl}}

このメールは自動送信です。ご不明な点がございましたらホストまでお問い合わせください。`),
  },
  cancellation: {
    name: 'デフォルトキャンセルメール',
    subject: '予約キャンセル: {{eventTypeName}} - {{date}}',
    body_html: textToHtml(`予約がキャンセルされました

予約タイプ: {{eventTypeName}}
日時: {{dateTime}}
ホスト: {{hostName}}
ゲスト: {{guestName}} ({{guestEmail}})

この予約はキャンセルされました。再度予約が必要な場合は、予約ページからお申し込みください。`),
  },
  reschedule: {
    name: 'デフォルト日時変更メール',
    subject: '予約日時変更: {{eventTypeName}} - {{date}}',
    body_html: textToHtml(`予約の日時が変更されました

予約タイプ: {{eventTypeName}}
新しい日時: {{dateTime}}
{{locationInfo}}
ホスト: {{hostName}}
ゲスト: {{guestName}} ({{guestEmail}})

再度日時を変更する場合: {{rescheduleUrl}}
キャンセルする場合: {{cancelUrl}}

このメールは自動送信です。ご不明な点がございましたらホストまでお問い合わせください。`),
  },
  reminder: {
    name: 'デフォルトリマインドメール',
    subject: 'リマインド: 明日 {{time}} - {{eventTypeName}}',
    body_html: textToHtml(`リマインド: 明日の予約

予約タイプ: {{eventTypeName}}
日時: {{dateTime}}
{{locationInfo}}

日時を変更する場合: {{rescheduleUrl}}
キャンセルする場合: {{cancelUrl}}`),
  },
};

/**
 * Replace {{variable}} placeholders in a template string
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}

/**
 * Build template variables from booking data
 */
export function getTemplateVariables(params: {
  guestName: string;
  guestEmail: string;
  hostName: string;
  eventTypeName: string;
  startTime: string;
  endTime: string;
  locationType: 'online' | 'offline';
  meetingUrl?: string | null;
  offlineLocation?: string | null;
  manageToken?: string | null;
}): Record<string, string> {
  const startDate = new Date(params.startTime);
  const endDate = new Date(params.endTime);
  const dateStr = format(startDate, 'yyyy年M月d日(E)', { locale: ja });
  const timeStr = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;

  const locationInfo = params.locationType === 'online'
    ? `オンライン: ${params.meetingUrl || '後ほどURLをお送りします'}`
    : `場所: ${params.offlineLocation || '後ほどご案内します'}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const manageBase = params.manageToken ? `${appUrl}/booking/manage/${params.manageToken}` : '';

  return {
    guestName: params.guestName,
    guestEmail: params.guestEmail,
    hostName: params.hostName,
    eventTypeName: params.eventTypeName,
    date: dateStr,
    time: format(startDate, 'HH:mm'),
    dateTime: `${dateStr} ${timeStr}`,
    locationInfo,
    cancelUrl: manageBase ? `${manageBase}?action=cancel` : '',
    rescheduleUrl: manageBase ? `${manageBase}?action=reschedule` : '',
    meetingUrl: params.meetingUrl || '',
  };
}

/**
 * Convert plain text to styled HTML email
 */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const bodyHtml = escaped.replace(/\n/g, '<br>');
  return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.8; color: #1f2937;">
${bodyHtml}
</div>`;
}

/**
 * Convert HTML back to plain text for editing
 */
export function htmlToText(html: string): string {
  let text = html;
  // Remove outer wrapper div
  text = text.replace(/<div[^>]*>([\s\S]*)<\/div>/i, '$1');
  // Convert <br> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Convert <p> to double newlines
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  text = text.replace(/<\/?p[^>]*>/gi, '\n');
  // Convert <a href="{{var}}">text</a> to text ({{var}})
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)');
  // Convert headings to text with emphasis
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1\n');
  // Remove <strong>/<b> but keep text
  text = text.replace(/<\/?(?:strong|b)>/gi, '');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ');
  // Clean up excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/** Available template variables for reference */
export const TEMPLATE_VARIABLES = [
  { key: 'guestName', description: 'ゲストの名前' },
  { key: 'guestEmail', description: 'ゲストのメールアドレス' },
  { key: 'hostName', description: 'ホストの名前' },
  { key: 'eventTypeName', description: '予約タイプ名' },
  { key: 'date', description: '日付 (例: 2026年3月17日(火))' },
  { key: 'time', description: '開始時刻 (例: 11:00)' },
  { key: 'dateTime', description: '日時 (例: 2026年3月17日(火) 11:00 - 11:30)' },
  { key: 'locationInfo', description: '場所情報' },
  { key: 'cancelUrl', description: 'キャンセルリンク' },
  { key: 'rescheduleUrl', description: '日時変更リンク' },
  { key: 'meetingUrl', description: 'ミーティングURL' },
];
