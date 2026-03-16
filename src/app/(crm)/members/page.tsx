'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shield, User, Mail, Check, Clock, Copy, Settings, Eye, Edit3, Users, Globe, X } from 'lucide-react';

interface Permissions {
  view: boolean;
  edit_own: boolean;
  manage_all: boolean;
  manage_members: string[]; // user IDs of members they can manage
}

interface Member {
  id: string;
  email: string;
  role: 'admin' | 'member';
  invited_at: string;
  joined_at: string | null;
  is_active: boolean;
  permissions: Permissions;
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
}

const DEFAULT_PERMISSIONS: Permissions = {
  view: true,
  edit_own: true,
  manage_all: false,
  manage_members: [],
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string | null>(null);
  const [tempPermissions, setTempPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    try {
      const res = await fetch('/api/members');
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;
    setAdding(true);
    setError('');

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '追加に失敗しました');
      } else {
        setNewEmail('');
        loadMembers();
      }
    } catch {
      setError('エラーが発生しました');
    } finally {
      setAdding(false);
    }
  }

  async function removeMember(id: string) {
    if (!confirm('このメンバーを削除しますか？削除するとログインできなくなります。')) return;
    try {
      await fetch(`/api/members?id=${id}`, { method: 'DELETE' });
      loadMembers();
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  function copyInviteLink(member: Member) {
    const link = `${window.location.origin}/login`;
    navigator.clipboard.writeText(
      `日程調整システムへの招待\n\n以下のリンクからGoogleアカウント（${member.email}）でログインしてください。\n${link}`
    );
    setCopiedId(member.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function openPermissions(member: Member) {
    setEditingPermissions(member.id);
    setTempPermissions(member.permissions || DEFAULT_PERMISSIONS);
  }

  async function savePermissions() {
    if (!editingPermissions) return;
    setSavingPermissions(true);
    try {
      const res = await fetch('/api/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingPermissions, permissions: tempPermissions }),
      });
      if (res.ok) {
        setEditingPermissions(null);
        loadMembers();
      }
    } catch (err) {
      console.error('Save permissions error:', err);
    } finally {
      setSavingPermissions(false);
    }
  }

  // Get joinedmembers for the manage_members selector
  const joinedMembers = members.filter(m => m.user && m.id !== editingPermissions);

  function toggleManageMember(userId: string) {
    setTempPermissions(prev => {
      const current = prev.manage_members || [];
      if (current.includes(userId)) {
        return { ...prev, manage_members: current.filter(id => id !== userId) };
      } else {
        return { ...prev, manage_members: [...current, userId] };
      }
    });
  }

  function getPermissionSummary(perms: Permissions): string {
    if (!perms) return '閲覧のみ';
    if (perms.manage_all) return '全カレンダー操作';
    const parts: string[] = [];
    if (perms.view) parts.push('閲覧');
    if (perms.edit_own) parts.push('自分の編集');
    if (perms.manage_members?.length > 0) parts.push(`${perms.manage_members.length}人の操作`);
    return parts.join(' / ') || '権限なし';
  }

  if (loading) return <div className="text-center py-12 text-gray-700">読み込み中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">メンバー管理</h1>
        <p className="text-gray-700 mt-1">招待したメンバーのみログインできます</p>
      </div>

      {/* Add member form */}
      <form onSubmit={addMember} className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <UserPlus className="w-4 h-4 inline mr-1.5" />
          メンバーを追加
        </label>
        <div className="flex gap-3">
          <input type="email" value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="example@company.com"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          <button type="submit" disabled={adding || !newEmail}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors">
            {adding ? '追加中...' : '追加'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <p className="text-xs text-gray-600 mt-2">
          追加後、招待リンクをコピーして相手に送ってください。
        </p>
      </form>

      {/* Members list */}
      <div className="space-y-3">
        {members.map(member => (
          <div key={member.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {member.user?.avatar_url ? (
                  <img src={member.user.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {member.user?.name || member.email}
                    </span>
                    {member.role === 'admin' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        <Shield className="w-3 h-3" /> 管理者
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail className="w-3.5 h-3.5" /> {member.email}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {member.joined_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <Check className="w-3 h-3" /> ログイン済み
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                        <Clock className="w-3 h-3" /> 未ログイン
                      </span>
                    )}
                    {member.role !== 'admin' && (
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                        {getPermissionSummary(member.permissions)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!member.joined_at && (
                  <button onClick={() => copyInviteLink(member)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                    {copiedId === member.id ? (
                      <><Check className="w-3.5 h-3.5 text-green-500" /> コピー済み</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> 招待リンク</>
                    )}
                  </button>
                )}
                {member.role !== 'admin' && (
                  <>
                    <button onClick={() => openPermissions(member)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      title="権限設定">
                      <Settings className="w-3.5 h-3.5" /> 権限
                    </button>
                    <button onClick={() => removeMember(member.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="削除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {members.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">メンバーがまだいません</p>
        </div>
      )}

      {/* Permissions Modal */}
      {editingPermissions && (() => {
        const member = members.find(m => m.id === editingPermissions);
        if (!member) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditingPermissions(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900">権限設定</h3>
                  <p className="text-sm text-gray-600">{member.user?.name || member.email}</p>
                </div>
                <button onClick={() => setEditingPermissions(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* View permission */}
                <label className="flex items-center justify-between p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">カレンダー閲覧</div>
                      <div className="text-xs text-gray-500">他のメンバーのカレンダーを閲覧</div>
                    </div>
                  </div>
                  <input type="checkbox" checked={tempPermissions.view}
                    onChange={e => setTempPermissions(p => ({ ...p, view: e.target.checked }))}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </label>

                {/* Edit own permission */}
                <label className="flex items-center justify-between p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Edit3 className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">自分のカレンダー編集</div>
                      <div className="text-xs text-gray-500">自分の予定の作成・編集・削除</div>
                    </div>
                  </div>
                  <input type="checkbox" checked={tempPermissions.edit_own}
                    onChange={e => setTempPermissions(p => ({ ...p, edit_own: e.target.checked }))}
                    className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                </label>

                {/* Manage all permission */}
                <label className="flex items-center justify-between p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-purple-500" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">全員のカレンダー操作</div>
                      <div className="text-xs text-gray-500">全メンバーの予定を編集・移動</div>
                    </div>
                  </div>
                  <input type="checkbox" checked={tempPermissions.manage_all}
                    onChange={e => setTempPermissions(p => ({ ...p, manage_all: e.target.checked, manage_members: e.target.checked ? [] : p.manage_members }))}
                    className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                </label>

                {/* Manage specific members */}
                {!tempPermissions.manage_all && (
                  <div className="p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="w-5 h-5 text-orange-500" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">特定メンバーのカレンダー操作</div>
                        <div className="text-xs text-gray-500">選択したメンバーの予定を編集・移動</div>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {joinedMembers.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">他にログイン済みメンバーがいません</p>
                      ) : (
                        joinedMembers.map(m => (
                          <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox"
                              checked={(tempPermissions.manage_members || []).includes(m.user!.id)}
                              onChange={() => toggleManageMember(m.user!.id)}
                              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                            <div className="flex items-center gap-2">
                              {m.user?.avatar_url ? (
                                <img src={m.user.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                                  <User className="w-3 h-3 text-gray-400" />
                                </div>
                              )}
                              <span className="text-sm text-gray-700">{m.user?.name || m.email}</span>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                <button onClick={() => setEditingPermissions(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  キャンセル
                </button>
                <button onClick={savePermissions} disabled={savingPermissions}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                  {savingPermissions ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
