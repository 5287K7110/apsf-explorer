import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  /** コピーするテキストを返す（クリック時点の内容を取るため関数渡し） */
  getText: () => string;
  title?: string;
}

/** テキストをクリップボードへコピーする小ボタン（成功時 ✓ を1.5秒表示） */
export const CopyButton: React.FC<Props> = ({ getText, title = 'コピー' }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API が使えない環境向けフォールバック
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      title={title}
      data-testid="copy-button"
      className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
};
