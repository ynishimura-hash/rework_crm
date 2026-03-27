'use client';

import { useState, useEffect } from 'react';
import { Mail, Eye, EyeOff, Plus, Trash2, Save, Info } from 'lucide-react';
import { TEMPLATE_VARIABLES, renderTemplate, htmlToText, textToHtml } from '@/lib/email-templates';
import type { EmailTemplate, EmailTemplateType } from '@/types';

const TYPE_LABELS: Record<EmailTemplateType, string> = {
  confirmation: '予約確認',
  cancellation: 'キャンセル',
  reschedule: '日時変更',
  reminder: 'リマインド',
};

const TYPE_COLORS: Record<EmailTemplateType, string> = {
  confirmation: 'bg-blue-100 text-blue-800',
  cancellation: 'bg-red-100 text-red-800',
  reschedule: 'bg-amber-100 text-amber-800',
  reminder: 'bg-green-100 text-green-800',
};

const SAMPLE_VARS: Record<string, string> = {
  guestName: '山田太郎',
  guestEmail: 'yamada@example.com',
  hostName: 'Rework担当者',
  eventTypeName: '30分ミーティング',
  date: '2026年3月17日(火)',
  time: '11:00',
  dateTime: '2026年3月17日(火) 11:00 - 11:30',
  locationInfo: 'オンライン: https://meet.google.com/xxx-yyyy-zzz',
  cancelUrl: '#cancel',
  rescheduleUrl: '#reschedule',
  meetingUrl: 'https://meet.google.com/xxx-yyyy-zzz',
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', subject: '', body_text: '' });
  const [showPreview, setShowPreview] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const res = await fetch('/api/email-templates');
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  };

  const startEdit = (tmpl: EmailTemplate) => {
    setEditingId(tmpl.id);
    setEditForm({ name: tmpl.name, subject: tmpl.subject, body_text: htmlToText(tmpl.body_html) });
    setShowPreview(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowPreview(false);
  };

  const saveTemplate = async () => {
    if (!editingId) return;
    setSaving(true);
    const body_html = textToHtml(editForm.body_text);
    await fetch('/api/email-templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, name: editForm.name, subject: editForm.subject, body_html }),
    });
    await loadTemplates();
    setEditingId(null);
    setSaving(false);
  };

  const createTemplate = async (type: EmailTemplateType) => {
    const res = await fetch('/api/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `カスタム${TYPE_LABELS[type]}メール`,
        type,
        subject: '',
        body_html: '',
      }),
    });
    const data = await res.json();
    await loadTemplates();
    if (data.template) startEdit(data.template);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('このテンプレートを削除しますか？')) return;
    await fetch(`/api/email-templates?id=${id}`, { method: 'DELETE' });
    await loadTemplates();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const grouped = (['confirmation', 'cancellation', 'reschedule', 'reminder'] as EmailTemplateType[]).map(type => ({
    type,
    label: TYPE_LABELS[type],
    templates: templates.filter(t => t.type === type),
  }));

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="w-6 h-6" /> メールテンプレート
          </h1>
          <p className="text-sm text-gray-600 mt-1">予約時に送信されるメールの内容をカスタマイズ</p>
        </div>
        <button
          onClick={() => setShowVars(!showVars)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <Info className="w-4 h-4" /> 変数一覧
        </button>
      </div>

      {showVars && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">利用可能な変数</h3>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {TEMPLATE_VARIABLES.map(v => (
              <div key={v.key} className="flex gap-2">
                <code className="text-blue-700 font-mono">{`{{${v.key}}}`}</code>
                <span className="text-gray-700">{v.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(({ type, label, templates: typeTemplates }) => (
          <div key={type} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[type]}`}>
                  {label}
                </span>
                <span className="text-sm text-gray-500">{typeTemplates.length}件</span>
              </div>
              <button
                onClick={() => createTemplate(type)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Plus className="w-3.5 h-3.5" /> 追加
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {typeTemplates.map(tmpl => (
                <div key={tmpl.id}>
                  {editingId === tmpl.id ? (
                    <div className="p-4 space-y-3 bg-white">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">テンプレート名</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">件名</label>
                        <input
                          type="text"
                          value={editForm.subject}
                          onChange={e => setEditForm({ ...editForm, subject: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-gray-700">本文</label>
                          <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800"
                          >
                            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {showPreview ? '編集' : 'プレビュー'}
                          </button>
                        </div>
                        {showPreview ? (
                          <div className="border border-gray-300 rounded-lg p-4 min-h-[200px] bg-white">
                            <div dangerouslySetInnerHTML={{
                              __html: renderTemplate(textToHtml(editForm.body_text), SAMPLE_VARS)
                            }} />
                          </div>
                        ) : (
                          <textarea
                            value={editForm.body_text}
                            onChange={e => setEditForm({ ...editForm, body_text: e.target.value })}
                            rows={12}
                            placeholder="普通にテキストを入力してください。改行はそのまま反映されます。&#10;&#10;{{guestName}} のように変数も使えます。"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={cancelEdit} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
                          キャンセル
                        </button>
                        <button
                          onClick={saveTemplate}
                          disabled={saving}
                          className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => startEdit(tmpl)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{tmpl.name}</span>
                          {tmpl.is_default && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">デフォルト</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{tmpl.subject}</p>
                      </div>
                      {!tmpl.is_default && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteTemplate(tmpl.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
