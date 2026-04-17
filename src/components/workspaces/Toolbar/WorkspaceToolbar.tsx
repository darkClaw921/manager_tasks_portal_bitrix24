'use client';

/**
 * Top-floating toolbar with the current tool buttons + keyboard shortcuts.
 *
 * Bound to the `tool` slice of `workspaceStore`. Each button:
 *   - Highlights itself when active.
 *   - Sets the tool via `setTool` on click.
 *   - Has a single-letter keyboard shortcut bound globally (V/R/O/L/A/T/S/P).
 *     Shortcuts are ignored when focus is inside an editable element.
 *
 * Icons are inline SVGs (no extra dependency on lucide-react in Phase 1).
 */

import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { useWorkspaceStore, type WorkspaceTool } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';
import { useUploadAsset, useGenerateImage } from '@/hooks/useWorkspaceAssets';

interface ToolDef {
  tool: WorkspaceTool;
  shortcut: string;
  label: string;
  icon: () => ReactElement;
}

function IconCursor() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="m4 4 7 16 2.5-7 7-2.5z" />
    </svg>
  );
}

function IconRect() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </svg>
  );
}

function IconEllipse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <ellipse cx="12" cy="12" rx="9" ry="6" />
    </svg>
  );
}

function IconLine() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4">
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="4" y1="20" x2="20" y2="4" />
      <polyline points="13 4 20 4 20 11" />
    </svg>
  );
}

function IconText() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M4 6h16M12 6v14M8 20h8" />
    </svg>
  );
}

function IconSticky() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M5 4h12l3 3v13H5z" />
      <path d="M14 4v3h3" />
    </svg>
  );
}

function IconPen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M3 21l3-1 11-11-2-2L4 18z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className="w-4 h-4">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M3 7v6h6" />
      <path d="M21 17a8 8 0 0 0-8-8h-9" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 7v6h-6" />
      <path d="M3 17a8 8 0 0 1 8-8h9" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

const TOOLS: ToolDef[] = [
  { tool: 'select', shortcut: 'V', label: 'Выбор', icon: IconCursor },
  { tool: 'rect', shortcut: 'R', label: 'Прямоугольник', icon: IconRect },
  { tool: 'ellipse', shortcut: 'O', label: 'Эллипс', icon: IconEllipse },
  { tool: 'line', shortcut: 'L', label: 'Линия', icon: IconLine },
  { tool: 'arrow', shortcut: 'A', label: 'Стрелка', icon: IconArrow },
  { tool: 'text', shortcut: 'T', label: 'Текст', icon: IconText },
  { tool: 'sticky', shortcut: 'S', label: 'Стикер', icon: IconSticky },
  { tool: 'pen', shortcut: 'P', label: 'Карандаш', icon: IconPen },
];

export interface WorkspaceToolbarProps {
  className?: string;
  /** Workspace id — required for image upload + AI image buttons. When
   *  omitted those buttons are hidden so the toolbar stays usable in
   *  read-only contexts (e.g. Phase 3 view-only mode). */
  workspaceId?: number;
  /**
   * Called with the new asset metadata after a successful upload OR AI
   * generation. The host wires it to `commitOp` so an `image` element
   * appears on the canvas.
   */
  onImageReady?: (asset: { assetId: number; width: number | null; height: number | null }) => void;
  /**
   * Insert a fresh 3×3 table at the current viewport center. The host
   * (`WorkspaceRoom`) wires this to `commitOp({type:'add', el:{kind:'table',...}})`.
   * When omitted the button is hidden.
   */
  onInsertTable?: () => void;
  /** Phase 3: undo/redo plumbing (omit to hide). */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Phase 3: snap-to-grid step in WORLD units. 0 = off. Caller toggles. */
  snapGridStep?: number;
  onToggleSnapGrid?: (next: number) => void;
  /** Phase 3: client-side export buttons (PNG / PDF). */
  onExportPng?: () => void;
  onExportPdf?: () => void;
}

export function WorkspaceToolbar({
  className,
  workspaceId,
  onImageReady,
  onInsertTable,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  snapGridStep = 0,
  onToggleSnapGrid,
  onExportPng,
  onExportPdf,
}: WorkspaceToolbarProps) {
  const tool = useWorkspaceStore((s) => s.tool);
  const setTool = useWorkspaceStore((s) => s.setTool);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Image actions are gated on having a workspaceId AND a callback wired —
  // otherwise the produced asset would have nowhere to go.
  const imageActionsEnabled = Boolean(workspaceId && onImageReady);

  const upload = useUploadAsset(workspaceId ?? 0);
  const generate = useGenerateImage(workspaceId ?? 0);

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !imageActionsEnabled) return;
    try {
      const asset = await upload.upload(file);
      onImageReady?.({ assetId: asset.assetId, width: asset.width, height: asset.height });
    } catch {
      // error already surfaced via upload.error
    }
  };

  const onGenerateSubmit = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || !imageActionsEnabled) return;
    try {
      const asset = await generate.generate(prompt);
      onImageReady?.({ assetId: asset.assetId, width: asset.width, height: asset.height });
      setAiOpen(false);
      setAiPrompt('');
    } catch {
      // error already surfaced via generate.error
    }
  };

  // Global keyboard shortcuts. Skipped when focus is in an editable element.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toUpperCase();
      const found = TOOLS.find((t) => t.shortcut === key);
      if (!found) return;
      e.preventDefault();
      setTool(found.tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-card bg-surface px-2 py-1 shadow-card border border-border',
          className
        )}
      >
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.tool;
          return (
            <button
              key={t.tool}
              type="button"
              title={`${t.label} (${t.shortcut})`}
              aria-label={t.label}
              aria-pressed={active}
              onClick={() => setTool(t.tool)}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-input transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:text-foreground hover:bg-background'
              )}
            >
              <Icon />
            </button>
          );
        })}
        {onInsertTable && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <button
              type="button"
              title="Вставить таблицу"
              aria-label="Вставить таблицу"
              onClick={onInsertTable}
              className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background"
            >
              <IconTable />
            </button>
          </>
        )}
        {(onUndo || onRedo) && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <button
              type="button"
              title="Отменить (Ctrl/Cmd+Z)"
              aria-label="Отменить"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background disabled:opacity-40"
            >
              <IconUndo />
            </button>
            <button
              type="button"
              title="Повторить (Ctrl/Cmd+Shift+Z)"
              aria-label="Повторить"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background disabled:opacity-40"
            >
              <IconRedo />
            </button>
          </>
        )}
        {onToggleSnapGrid && (
          <button
            type="button"
            title={snapGridStep > 0 ? `Привязка к сетке (${snapGridStep}px) — выкл.` : 'Привязка к сетке — вкл.'}
            aria-label="Привязка к сетке"
            aria-pressed={snapGridStep > 0}
            onClick={() => onToggleSnapGrid(snapGridStep > 0 ? 0 : 16)}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-input transition-colors',
              snapGridStep > 0
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:text-foreground hover:bg-background'
            )}
          >
            <IconGrid />
          </button>
        )}
        {(onExportPng || onExportPdf) && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {onExportPng && (
              <button
                type="button"
                title="Экспорт PNG"
                aria-label="Экспорт PNG"
                onClick={onExportPng}
                className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background"
              >
                <IconDownload />
                <span className="ml-1 text-[10px] font-semibold">PNG</span>
              </button>
            )}
            {onExportPdf && (
              <button
                type="button"
                title="Экспорт PDF"
                aria-label="Экспорт PDF"
                onClick={onExportPdf}
                className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background"
              >
                <IconDownload />
                <span className="ml-1 text-[10px] font-semibold">PDF</span>
              </button>
            )}
          </>
        )}
        {imageActionsEnabled && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <button
              type="button"
              title="Загрузить изображение"
              aria-label="Загрузить изображение"
              onClick={onUploadClick}
              disabled={upload.isLoading}
              className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background disabled:opacity-60"
            >
              {upload.isLoading ? (
                <span className="text-xs">…</span>
              ) : (
                <IconImage />
              )}
            </button>
            <button
              type="button"
              title="AI: сгенерировать картинку"
              aria-label="AI: сгенерировать картинку"
              onClick={() => setAiOpen(true)}
              disabled={generate.isLoading}
              className="flex items-center justify-center w-8 h-8 rounded-input text-text-secondary hover:text-foreground hover:bg-background disabled:opacity-60"
            >
              {generate.isLoading ? (
                <span className="text-xs">…</span>
              ) : (
                <IconSparkle />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={onFileChange}
            />
          </>
        )}
      </div>
      {(upload.error || generate.error) && (
        <div className="text-xs text-danger bg-surface rounded-input border border-danger/30 px-2 py-1 shadow-card">
          {upload.error ?? generate.error}
        </div>
      )}
      {aiOpen && imageActionsEnabled && (
        <div className="rounded-card bg-surface shadow-card border border-border p-3 w-80">
          <div className="text-small font-semibold mb-1">AI: сгенерировать картинку</div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Опишите изображение..."
            rows={3}
            disabled={generate.isLoading}
            maxLength={2000}
            className="w-full resize-none rounded-input border border-border bg-background px-2 py-1.5 text-small focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAiOpen(false);
                setAiPrompt('');
              }}
              disabled={generate.isLoading}
              className="px-3 py-1 text-small text-text-secondary hover:text-foreground disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={onGenerateSubmit}
              disabled={generate.isLoading || aiPrompt.trim().length === 0}
              className="px-3 py-1 text-small bg-primary text-text-inverse rounded-input disabled:opacity-60"
            >
              {generate.isLoading ? 'Генерация…' : 'Сгенерировать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
