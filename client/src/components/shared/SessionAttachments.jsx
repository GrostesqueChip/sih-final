import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiPaperclip, FiUpload, FiDownload, FiTrash2, FiImage, FiFileText, FiLock } from 'react-icons/fi';
import apiClient from '../../hooks/useApi';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Photographs and supporting documents of a test session: list, download,
 * and (while the session is open and the user may record in it) upload and remove.
 */
export default function SessionAttachments({ sessionId, canEdit, sealed }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [caption, setCaption] = useState('');
  const key = ['session-attachments', sessionId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => (await apiClient.get(`/tests/${sessionId}/attachments`)).data,
  });
  const files = data?.data || [];
  const limits = data?.limits || { maxFiles: 10, maxFileBytes: 5 * 1024 * 1024 };

  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      if (caption.trim()) form.append('caption', caption.trim());
      return apiClient.post(`/tests/${sessionId}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      setCaption('');
      if (inputRef.current) inputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: key });
      toast.success(t('att.saved', 'Attachment saved'));
    },
    onError: (err) => toast.error(err.response?.data?.message || t('att.failed', 'Could not attach the file.')),
  });

  const remove = useMutation({
    mutationFn: async (id) => apiClient.delete(`/tests/${sessionId}/attachments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (err) => toast.error(err.response?.data?.message || t('att.removeFailed', 'Could not remove the attachment.')),
  });

  const download = async (a) => {
    try {
      const res = await apiClient.get(`/tests/${sessionId}/attachments/${a.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: a.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = a.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('att.downloadFailed', 'Could not download the file.'));
    }
  };

  const onPick = (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (file.size > limits.maxFileBytes) {
      toast.error(t('att.tooBig', 'File is larger than {{n}} MB.', { n: limits.maxFileBytes / 1024 / 1024 }));
      ev.target.value = '';
      return;
    }
    upload.mutate(file);
  };

  const full = files.length >= limits.maxFiles;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid="session-attachments">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
            <FiPaperclip className="w-4 h-4 text-navy" /> {t('att.title', 'Photographs and supporting documents')}
          </h2>
          <p className="text-xs text-slate-500">
            {t('att.sub', 'JPEG, PNG, WebP or PDF, up to {{mb}} MB each, {{n}} per session. Listed in the report annex with their SHA-256.', { mb: limits.maxFileBytes / 1024 / 1024, n: limits.maxFiles })}
          </p>
        </div>
        <span className="text-sm font-extrabold text-navy shrink-0">{files.length}/{limits.maxFiles}</span>
      </div>

      {files.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{t('att.none', 'Nothing attached yet.')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {files.map((a) => (
            <li key={a.id} className="px-5 py-3 flex items-center gap-3">
              {a.mimeType === 'application/pdf' ? <FiFileText className="w-5 h-5 text-slate-500 shrink-0" /> : <FiImage className="w-5 h-5 text-slate-500 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{a.fileName}</div>
                <div className="text-xs text-slate-500 truncate">
                  {kb(a.size)}{a.caption ? ` · ${a.caption}` : ''} · <span className="font-mono">sha256 {a.sha256.slice(0, 16)}…</span>
                </div>
              </div>
              <button type="button" onClick={() => download(a)} className="h-8 px-2.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
                <FiDownload className="w-3.5 h-3.5" /> {t('att.download', 'Download')}
              </button>
              {canEdit && (
                <button type="button" onClick={() => remove.mutate(a.id)} disabled={remove.isPending} aria-label={t('att.remove', 'Remove {{f}}', { f: a.fileName })} className="h-8 w-8 rounded-md border border-slate-300 text-red-700 hover:bg-red-50 inline-flex items-center justify-center disabled:opacity-60">
                  <FiTrash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={200}
            placeholder={t('att.captionPh', 'Caption, e.g. Rating plate of the test sample…')}
            aria-label={t('att.caption', 'Caption for the next file')}
            className="flex-1 h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
          />
          <input ref={inputRef} id={`att-file-${sessionId}`} type="file" accept={ACCEPT} onChange={onPick} disabled={upload.isPending || full} className="sr-only" />
          <label
            htmlFor={`att-file-${sessionId}`}
            className={`inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-bold ${upload.isPending || full ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-navy text-white hover:bg-primary-800 cursor-pointer'}`}
          >
            <FiUpload className="w-4 h-4" /> {upload.isPending ? t('att.uploading', 'Uploading…') : full ? t('att.full', 'Limit reached') : t('att.add', 'Attach a file')}
          </label>
        </div>
      ) : (
        sealed && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-600 flex items-center gap-2">
            <FiLock className="w-3.5 h-3.5" /> {t('att.locked', 'This session is sealed: attachments can no longer be changed.')}
          </div>
        )
      )}
    </div>
  );
}
