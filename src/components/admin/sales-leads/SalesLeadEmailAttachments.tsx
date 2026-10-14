import { useRef, useState } from 'react';
import { Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export type SalesLeadEmailAttachment = {
  id: string;
  filename: string;
  content: string;
  content_type: string;
  size: number;
};

const MAX_SALES_LEAD_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  'adp', 'app', 'asp', 'bas', 'bat', 'cer', 'chm', 'cmd', 'com', 'cpl',
  'crt', 'csh', 'der', 'exe', 'fxp', 'gadget', 'hlp', 'hta', 'inf', 'ins',
  'isp', 'its', 'js', 'jse', 'ksh', 'lib', 'lnk', 'mad', 'maf', 'mag',
  'mam', 'maq', 'mar', 'mas', 'mat', 'mau', 'mav', 'maw', 'mda', 'mdb',
  'mde', 'mdt', 'mdw', 'mdz', 'msc', 'msh', 'msh1', 'msh2', 'mshxml',
  'msh1xml', 'msh2xml', 'msi', 'msp', 'mst', 'ops', 'pcd', 'pif', 'plg',
  'prf', 'prg', 'reg', 'scf', 'scr', 'sct', 'shb', 'shs', 'sys', 'ps1',
  'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'tmp', 'url', 'vb', 'vbe',
  'vbs', 'vps', 'vsmacros', 'vss', 'vst', 'vsw', 'vxd', 'ws', 'wsc',
  'wsf', 'wsh', 'xnk',
]);

const formatAttachmentSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });

export function SalesLeadEmailAttachmentsField({
  attachments,
  onChange,
  disabled,
}: {
  attachments: SalesLeadEmailAttachment[];
  onChange: (next: SalesLeadEmailAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [reading, setReading] = useState(false);

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0 || disabled || reading) return;

    const currentSize = attachments.reduce((sum, item) => sum + item.size, 0);
    const incomingSize = files.reduce((sum, file) => sum + file.size, 0);
    if (currentSize + incomingSize > MAX_SALES_LEAD_ATTACHMENT_BYTES) {
      toast.error(`Přílohy mohou mít dohromady nejvýše ${formatAttachmentSize(MAX_SALES_LEAD_ATTACHMENT_BYTES)}.`);
      return;
    }

    const blocked = files.find((file) => BLOCKED_ATTACHMENT_EXTENSIONS.has(extensionOf(file.name)));
    if (blocked) {
      toast.error(`Soubor ${blocked.name} nelze poslat jako přílohu.`);
      return;
    }

    setReading(true);
    try {
      const loaded = await Promise.all(files.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        filename: file.name,
        content: await readFileAsBase64(file),
        content_type: file.type || 'application/octet-stream',
        size: file.size,
      })));
      onChange([...attachments, ...loaded]);
    } catch {
      toast.error('Přílohu se nepodařilo načíst.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => onChange(attachments.filter((item) => item.id !== id));
  const totalSize = attachments.reduce((sum, item) => sum + item.size, 0);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void addFiles(event.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed px-3 py-3 transition-colors ${
          dragActive ? 'border-primary/60 bg-primary/10' : 'border-white/[0.11] bg-background/45'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Upload className="h-4 w-4 shrink-0 opacity-70" />
            <span>Přetáhněte soubory sem nebo je vyberte ručně.</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || reading}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {reading ? 'Načítám…' : 'Přidat přílohu'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
            }}
            disabled={disabled || reading}
          />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Celkem {formatAttachmentSize(totalSize)} z {formatAttachmentSize(MAX_SALES_LEAD_ATTACHMENT_BYTES)}.
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-background/65 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{attachment.filename}</div>
                <div className="text-[11px] text-muted-foreground">{formatAttachmentSize(attachment.size)}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removeAttachment(attachment.id)}
                disabled={disabled}
                aria-label={`Odebrat přílohu ${attachment.filename}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
