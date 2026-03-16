'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { Send, Pencil, Trash2, X, Check } from 'lucide-react';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user?: { id: string; name: string; email: string; avatar_url: string };
}

interface CommentSectionProps {
  targetType: 'booking' | 'event_type' | 'google_event';
  targetId: string;
  currentUserId?: string;
}

export default function CommentSection({ targetType, targetId, currentUserId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?targetType=${targetType}&targetId=${targetId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, content: newComment }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [...prev, data.comment]);
        setNewComment('');
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetch('/api/comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: editContent }),
      });
      if (res.ok) {
        setComments(prev => prev.map(c => c.id === id ? { ...c, content: editContent.trim(), updated_at: new Date().toISOString() } : c));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Failed to update comment:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/comments?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const getInitial = (comment: Comment) => {
    const name = comment.user?.name || comment.user?.email || '?';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">コメント</h4>

      {loading ? (
        <div className="text-xs text-gray-500 py-2">読み込み中...</div>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {comments.length === 0 && (
            <p className="text-xs text-gray-500">コメントはまだありません</p>
          )}
          {comments.map(comment => (
            <div key={comment.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium shrink-0">
                {getInitial(comment)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-900 truncate">
                    {comment.user?.name || comment.user?.email || '不明'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {format(parseISO(comment.created_at), 'M/d HH:mm')}
                  </span>
                  {currentUserId === comment.user_id && (
                    <div className="flex items-center gap-0.5 ml-auto">
                      <button
                        onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                        className="p-0.5 hover:bg-gray-100 rounded"
                      >
                        <Pencil className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="p-0.5 hover:bg-gray-100 rounded"
                      >
                        <Trash2 className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>
                {editingId === comment.id ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="text"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdate(comment.id); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                    />
                    <button onClick={() => handleUpdate(comment.id)} className="p-1 hover:bg-green-50 rounded">
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New comment input */}
      <div className="flex items-center gap-2 mt-3">
        <input
          type="text"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="コメントを入力..."
          className="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        />
        <button
          onClick={handleSubmit}
          disabled={!newComment.trim() || submitting}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
