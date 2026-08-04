import { useRef, useState } from 'react';
import { Bold, Eye, Italic, Link2, List, SmilePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { renderSalesLeadEmailHtml } from '../../../../supabase/functions/_shared/salesLeadEmailRendering';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

const EMOJIS = ['✨', '✅', '🚀', '🎁', '🤝', '👉'];

export function SalesLeadRichTextEditor({
  id,
  value,
  onChange,
  rows = 12,
  maxLength = 20_000,
  placeholder,
  disabled = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);

  const replaceSelection = (
    prefix: string,
    suffix = '',
    fallback = 'text',
    selectFallback = true,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`.slice(0, maxLength);
    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + prefix.length;
      const selectionEnd = selectFallback && start === end
        ? selectionStart + selected.length
        : selectionStart + selected.length + suffix.length;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const insertBulletList = () => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || 'První bod\nDruhý bod';
    const replacement = selected
      .split('\n')
      .map((line) => line.trim() ? `- ${line.replace(/^[-•]\s+/, '')}` : '-')
      .join('\n');
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`.slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
  };

  const insertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const label = value.slice(start, end) || 'text odkazu';
    const replacement = `[${label}](https://)`;
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`.slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const urlStart = start + label.length + 3;
      textarea.setSelectionRange(urlStart, urlStart + 8);
    });
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`.slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-background/55" data-testid="sales-lead-rich-text-editor">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] bg-card/70 px-2 py-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => replaceSelection('**', '**', 'důležitý text')} disabled={disabled} title="Tučně">
          <Bold className="h-4 w-4" /><span className="sr-only">Tučně</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => replaceSelection('*', '*', 'zvýrazněný text')} disabled={disabled} title="Kurzíva">
          <Italic className="h-4 w-4" /><span className="sr-only">Kurzíva</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={insertBulletList} disabled={disabled} title="Odrážky">
          <List className="h-4 w-4" /><span className="sr-only">Odrážky</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={insertLink} disabled={disabled} title="Odkaz">
          <Link2 className="h-4 w-4" /><span className="sr-only">Odkaz</span>
        </Button>
        <span className="mx-1 h-5 w-px bg-white/[0.1]" aria-hidden />
        <SmilePlus className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors hover:bg-muted disabled:opacity-50"
            onClick={() => insertEmoji(emoji)}
            disabled={disabled}
            title={`Vložit ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <Button type="button" variant={previewOpen ? 'secondary' : 'ghost'} size="sm" className="ml-auto h-8 gap-1.5 px-2" onClick={() => setPreviewOpen((open) => !open)}>
          <Eye className="h-4 w-4" /> Náhled
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        maxLength={maxLength}
        className="resize-y rounded-none border-0 bg-transparent leading-6 focus-visible:ring-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />

      {previewOpen && (
        <div className="border-t border-white/[0.08] bg-white px-5 py-4 text-left" data-testid="sales-lead-email-preview">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Náhled výsledného e-mailu</div>
          {value.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: renderSalesLeadEmailHtml(value) }} />
          ) : (
            <div className="text-sm text-slate-400">Začněte psát text šablony.</div>
          )}
        </div>
      )}
    </div>
  );
}
