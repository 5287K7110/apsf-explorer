import React from 'react';
import { Loader2, PenLine, Save, X } from 'lucide-react';

interface Props {
  fileToWrite: string;
  editorContent: string;
  onContentChange: (v: string) => void;
  editorLoading: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}

export const PhaseEditor: React.FC<Props> = ({
  fileToWrite, editorContent, onContentChange, editorLoading, saving, onSave, onClose,
}) => (
  <div className="bg-slate-900 border border-amber-800/60 rounded-xl p-4 space-y-3" data-testid="apsf-editor">
    <div className="flex items-center justify-between">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <PenLine size={14} /> {fileToWrite}
        <span className="text-xs text-slate-500 font-normal">
          保存は apsf write-phase 経由（上書き保護・フェーズ遷移付き）
        </span>
      </h4>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-slate-800 text-slate-400"
      >
        <X size={14} />
      </button>
    </div>
    {editorLoading ? (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
        <Loader2 className="animate-spin" size={16} /> loading...
      </div>
    ) : (
      <textarea
        value={editorContent}
        onChange={(e) => onContentChange(e.target.value)}
        rows={14}
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono resize-y focus:border-amber-600 focus:outline-none"
        data-testid="apsf-editor-textarea"
        placeholder="Markdown で記入..."
      />
    )}
    <button
      onClick={onSave}
      disabled={saving || !editorContent.trim()}
      data-testid="apsf-save-phase"
      className="flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
    >
      {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
      {saving ? 'Saving...' : `Save ${fileToWrite}`}
    </button>
  </div>
);
