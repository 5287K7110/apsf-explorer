import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apsfAPI } from '../services/apsfAPI';
import { CopyButton } from './apsf/CopyButton';

/**
 * 成果物ビューア — run の phase ファイルを Markdown レンダリングで読む
 *
 * - 完全リードオンリー（編集は既存の human フェーズエディタに委ねる）
 * - 生 HTML は描画しない（react-markdown の既定 = rehype-raw なし、XSS 面の既定安全）
 * - 大きいファイル（>200KB）は先頭のみ表示 + 警告
 */

/** 表示順（ワークフロー順） */
const DISPLAY_ORDER = [
  'task.md', 'execution-assignment.md', 'goal.md',
  'plan_review.md', 'plan.md', 'handoff.md',
  'build_review.md', 'improve-plan.md', 'build.md',
  'review_review.md', 'review.md',
  'improve_review.md', 'improve.md', 'verify.md',
  'result.md', 'transcript.md', 'model-assignment.md',
];

const MAX_RENDER_BYTES = 200 * 1024;

interface Props {
  runId: string;
  existingFiles: string[];
}

export const ArtifactViewer: React.FC<Props> = ({ runId, existingFiles }) => {
  const files = DISPLAY_ORDER.filter((f) => existingFiles.includes(f));
  const [selected, setSelected] = useState<string>('');
  const [content, setContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // run が変わったら選択をリセット
  useEffect(() => {
    setSelected('');
    setContent('');
    setError(null);
  }, [runId]);

  const openFile = async (file: string) => {
    setSelected(file);
    setLoading(true);
    setError(null);
    try {
      const res = await apsfAPI.getFile(runId, file);
      // バイト長で判定する（string.length は非 ASCII で実サイズと乖離する）
      const bytes = new TextEncoder().encode(res.content);
      if (bytes.length > MAX_RENDER_BYTES) {
        setContent(new TextDecoder().decode(bytes.slice(0, MAX_RENDER_BYTES)));
        setTruncated(true);
      } else {
        setContent(res.content);
        setTruncated(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ファイルを読み込めませんでした');
      setContent('');
    } finally {
      setLoading(false);
    }
  };

  if (files.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4" data-testid="apsf-artifacts">
      <div className="flex items-center justify-between mb-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <FileText size={14} /> Artifacts
        </h4>
        {selected && !loading && !error && (
          <CopyButton getText={() => content} title={`${selected} をコピー`} />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {files.map((f) => (
          <button
            key={f}
            onClick={() => openFile(f)}
            data-testid={`apsf-artifact-tab-${f}`}
            className={`px-2.5 py-1 rounded-full text-xs font-mono border transition ${
              selected === f
                ? 'bg-blue-900/50 text-blue-200 border-blue-700'
                : 'text-slate-400 border-slate-700 hover:bg-slate-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {selected && (
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto" data-testid="apsf-artifact-content">
          {loading ? (
            <p className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="animate-spin" size={14} /> loading {selected}...
            </p>
          ) : error ? (
            <div className="text-sm text-red-400 space-y-2">
              <p>{selected} を読み込めませんでした: {error}</p>
              <button
                onClick={() => openFile(selected)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-xs"
              >
                再試行
              </button>
            </div>
          ) : (
            <>
              {truncated && (
                <p className="mb-3 px-3 py-2 bg-amber-900/30 border border-amber-800 rounded text-xs text-amber-300">
                  ファイルが大きいため先頭 200KB のみ表示しています
                </p>
              )}
              <div className="artifact-markdown text-sm text-slate-300 leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: (p) => <h1 className="text-lg font-bold text-slate-100 mt-4 mb-2 first:mt-0" {...p} />,
                    h2: (p) => <h2 className="text-base font-semibold text-slate-100 mt-4 mb-2 first:mt-0" {...p} />,
                    h3: (p) => <h3 className="text-sm font-semibold text-slate-200 mt-3 mb-1.5" {...p} />,
                    p: (p) => <p className="my-2" {...p} />,
                    ul: (p) => <ul className="list-disc ml-5 my-2 space-y-1" {...p} />,
                    ol: (p) => <ol className="list-decimal ml-5 my-2 space-y-1" {...p} />,
                    a: (p) => (
                      <a className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" {...p} />
                    ),
                    code: ({ className, ...rest }) => {
                      // className は language-xxx（フェンス言語）を保持しつつ
                      // ビューアのスタイルとマージする（spread で上書きさせない）
                      const isBlock = String(className || '').includes('language-');
                      const merged = isBlock
                        ? `${className} block bg-slate-900 border border-slate-800 rounded p-3 my-2 text-xs font-mono whitespace-pre-wrap break-all text-slate-300`
                        : `${className ?? ''} bg-slate-800 rounded px-1 py-0.5 text-xs font-mono text-amber-300`;
                      return <code className={merged.trim()} {...rest} />;
                    },
                    pre: (p) => <pre className="my-2" {...p} />,
                    table: (p) => <table className="border-collapse my-2 text-xs" {...p} />,
                    th: (p) => <th className="border border-slate-700 px-2 py-1 bg-slate-800 text-left" {...p} />,
                    td: (p) => <td className="border border-slate-800 px-2 py-1 align-top" {...p} />,
                    blockquote: (p) => (
                      <blockquote className="border-l-2 border-slate-700 pl-3 my-2 text-slate-400" {...p} />
                    ),
                    hr: () => <hr className="border-slate-800 my-3" />,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
