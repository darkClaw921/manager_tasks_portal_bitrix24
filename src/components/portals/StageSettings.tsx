'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  useCustomStages,
  useCreateCustomStage,
  useUpdateCustomStage,
  useDeleteCustomStage,
  useMapBitrixStage,
  useUnmapBitrixStage,
  usePortalStages,
} from '@/hooks/usePortalSettings';
import type { CustomStageWithMappings, PortalStageWithMapping } from '@/hooks/usePortalSettings';

// ==================== Types ====================

interface StageSettingsProps {
  portalId: number;
}

// ==================== Color Presets ====================

const COLOR_PRESETS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
  '#14B8A6', // teal
  '#64748B', // slate
];

// ==================== Create Stage Form ====================

function CreateStageForm({
  portalId,
  onCreated,
}: {
  portalId: number;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [showForm, setShowForm] = useState(false);
  const createStage = useCreateCustomStage();

  const handleSubmit = async () => {
    if (!title.trim()) return;

    try {
      await createStage.mutateAsync({
        portalId,
        title: title.trim(),
        color,
      });
      setTitle('');
      setColor(COLOR_PRESETS[0]);
      setShowForm(false);
      onCreated?.();
    } catch {
      // Error handled by TanStack Query
    }
  };

  if (!showForm) {
    return (
      <Button size="sm" onClick={() => setShowForm(true)}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Добавить стадию
      </Button>
    );
  }

  return (
    <div className="p-4 rounded-input border border-border bg-background space-y-3">
      <h4 className="text-small font-medium text-foreground">Новая пользовательская стадия</h4>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название стадии..."
        className="w-full rounded-input border border-border px-3 py-2 text-body text-foreground bg-surface outline-none focus:border-primary"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') setShowForm(false);
        }}
      />

      {/* Color picker */}
      <div className="space-y-1.5">
        <span className="text-small text-text-secondary">Цвет:</span>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'w-7 h-7 rounded-full border-2 transition-all',
                color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <label className="w-7 h-7 rounded-full border border-border flex items-center justify-center cursor-pointer hover:border-border-hover" title="Свой цвет">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
            />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
            </svg>
          </label>
        </div>
      </div>

      {createStage.isError && (
        <p className="text-small text-danger">
          {createStage.error instanceof Error ? createStage.error.message : 'Не удалось создать стадию'}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} loading={createStage.isPending} disabled={!title.trim()}>
          Создать
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

// ==================== Stage Edit Form ====================

function StageEditForm({
  stage,
  portalId,
  onClose,
}: {
  stage: CustomStageWithMappings;
  portalId: number;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(stage.title);
  const [color, setColor] = useState(stage.color || COLOR_PRESETS[0]);
  const updateStage = useUpdateCustomStage();

  const handleSave = async () => {
    if (!title.trim()) return;

    try {
      await updateStage.mutateAsync({
        portalId,
        stageId: stage.id,
        title: title.trim(),
        color,
      });
      onClose();
    } catch {
      // Error handled by TanStack Query
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название стадии..."
        className="w-full rounded-input border border-border px-3 py-2 text-body text-foreground bg-surface outline-none focus:border-primary"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onClose();
        }}
      />

      {/* Color picker */}
      <div className="space-y-1.5">
        <span className="text-small text-text-secondary">Цвет:</span>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-all',
                color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="w-6 h-6 rounded-full border border-border flex items-center justify-center cursor-pointer hover:border-border-hover">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
            />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
            </svg>
          </label>
        </div>
      </div>

      {updateStage.isError && (
        <p className="text-small text-danger">
          {updateStage.error instanceof Error ? updateStage.error.message : 'Не удалось обновить стадию'}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} loading={updateStage.isPending} disabled={!title.trim()}>
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

// ==================== Bitrix Stage Mapper ====================

function BitrixStageMapper({
  stage,
  portalId,
  allBitrixStages,
  mappedBitrixStageIds,
}: {
  stage: CustomStageWithMappings;
  portalId: number;
  allBitrixStages: PortalStageWithMapping[];
  mappedBitrixStageIds: Set<number>;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const mapStage = useMapBitrixStage();
  const unmapStage = useUnmapBitrixStage();

  // Available Bitrix stages (not yet mapped to any custom stage, or mapped to this one)
  const availableStages = useMemo(
    () => allBitrixStages.filter(
      (s) => !mappedBitrixStageIds.has(s.id) || stage.mappedStages.some((m) => m.taskStageId === s.id)
    ),
    [allBitrixStages, mappedBitrixStageIds, stage.mappedStages]
  );

  const handleMap = async (bitrixStageId: number) => {
    try {
      await mapStage.mutateAsync({
        portalId,
        stageId: stage.id,
        bitrixStageId,
      });
    } catch {
      // Error handled by TanStack Query
    }
  };

  const handleUnmap = async (bitrixStageId: number) => {
    try {
      await unmapStage.mutateAsync({
        portalId,
        stageId: stage.id,
        bitrixStageId,
      });
    } catch {
      // Error handled by TanStack Query
    }
  };

  return (
    <div className="mt-2">
      {/* Current mappings */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {stage.mappedStages.length === 0 ? (
          <span className="text-xs text-text-muted">Стадии Bitrix24 не привязаны</span>
        ) : (
          stage.mappedStages.map((m) => (
            <span
              key={m.taskStageId}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-badge bg-background border border-border text-foreground"
            >
              {m.color && (
                <span
                  className="w-2 h-2 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: m.color }}
                />
              )}
              <span className="truncate max-w-[120px]">{m.title}</span>
              <button
                type="button"
                onClick={() => handleUnmap(m.taskStageId)}
                className="ml-0.5 text-text-muted hover:text-danger transition-colors"
                disabled={unmapStage.isPending}
                title="Удалить привязку"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))
        )}
      </div>

      {/* Add mapping dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-input border border-dashed border-border text-text-muted hover:text-foreground hover:border-border-hover transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Привязать стадию Bitrix24
        </button>

        {showDropdown && (
          <div className="absolute z-20 mt-1 w-64 bg-surface border border-border rounded-input shadow-lg max-h-48 overflow-y-auto">
            {availableStages.length === 0 ? (
              <div className="p-3 text-xs text-text-muted text-center">
                Нет доступных стадий Bitrix24
              </div>
            ) : (
              availableStages.map((bs) => {
                const isAlreadyMapped = stage.mappedStages.some((m) => m.taskStageId === bs.id);
                return (
                  <button
                    key={bs.id}
                    type="button"
                    onClick={() => {
                      if (!isAlreadyMapped) {
                        handleMap(bs.id);
                      }
                      setShowDropdown(false);
                    }}
                    disabled={isAlreadyMapped || mapStage.isPending}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                      isAlreadyMapped
                        ? 'opacity-50 cursor-not-allowed bg-background'
                        : 'hover:bg-background cursor-pointer'
                    )}
                  >
                    {bs.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: bs.color }}
                      />
                    )}
                    <span className="truncate">{bs.title}</span>
                    {isAlreadyMapped && (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-primary shrink-0 ml-auto">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Custom Stage Row ====================

function CustomStageRow({
  stage,
  portalId,
  index,
  totalStages,
  allBitrixStages,
  mappedBitrixStageIds,
  onMoveUp,
  onMoveDown,
}: {
  stage: CustomStageWithMappings;
  portalId: number;
  index: number;
  totalStages: number;
  allBitrixStages: PortalStageWithMapping[];
  mappedBitrixStageIds: Set<number>;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteStage = useDeleteCustomStage();

  const handleDelete = async () => {
    try {
      await deleteStage.mutateAsync({ portalId, stageId: stage.id });
      setConfirmDelete(false);
    } catch {
      // Error handled by TanStack Query
    }
  };

  return (
    <div className="p-3 rounded-input border border-border hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Stage info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Color swatch */}
          <div
            className="w-8 h-8 rounded-input shrink-0 border border-border/50"
            style={{ backgroundColor: stage.color || '#64748B' }}
          />
          <div className="min-w-0">
            <p className="font-medium text-body truncate">{stage.title}</p>
            <p className="text-xs text-text-muted">
              {stage.mappedStages.length} {stage.mappedStages.length === 1 ? 'стадия Bitrix24 привязана' : 'стадий Bitrix24 привязано'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Move up */}
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 rounded-input text-text-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Переместить вверх"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>

          {/* Move down */}
          <button
            onClick={onMoveDown}
            disabled={index === totalStages - 1}
            className="p-1.5 rounded-input text-text-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Переместить вниз"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Edit */}
          <button
            onClick={() => setEditing(!editing)}
            className="p-1.5 rounded-input text-text-muted hover:text-foreground hover:bg-background transition-colors"
            title="Редактировать стадию"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-input text-text-muted hover:text-danger hover:bg-danger-light transition-colors"
            title="Удалить стадию"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bitrix24 stage mappings */}
      <BitrixStageMapper
        stage={stage}
        portalId={portalId}
        allBitrixStages={allBitrixStages}
        mappedBitrixStageIds={mappedBitrixStageIds}
      />

      {/* Edit form */}
      {editing && (
        <StageEditForm
          stage={stage}
          portalId={portalId}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-small text-danger mb-2">
            Удалить стадию &quot;{stage.title}&quot;? Все привязки к стадиям Bitrix24 будут удалены.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={handleDelete}
              loading={deleteStage.isPending}
            >
              Удалить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Unmapped Stages Section ====================

function UnmappedStages({
  allBitrixStages,
  mappedBitrixStageIds,
}: {
  allBitrixStages: PortalStageWithMapping[];
  mappedBitrixStageIds: Set<number>;
}) {
  const unmappedStages = useMemo(
    () => allBitrixStages.filter((s) => !mappedBitrixStageIds.has(s.id)),
    [allBitrixStages, mappedBitrixStageIds]
  );

  if (unmappedStages.length === 0) return null;

  return (
    <div className="mt-4 p-3 rounded-input bg-warning-light/30 border border-warning/20">
      <div className="flex items-center gap-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-warning shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <span className="text-small font-medium text-warning">
          {unmappedStages.length} {unmappedStages.length === 1 ? 'непривязанная стадия Bitrix24' : 'непривязанных стадий Bitrix24'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unmappedStages.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-badge bg-background border border-border text-text-secondary"
          >
            {s.color && (
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: s.color }}
              />
            )}
            {s.title}
          </span>
        ))}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function StageSettings({ portalId }: StageSettingsProps) {
  const { data: customStages, isLoading: isCustomStagesLoading } = useCustomStages(portalId);
  const { data: portalStages, isLoading: isPortalStagesLoading, refetch: refetchStages } = usePortalStages(portalId);
  const [refreshing, setRefreshing] = useState(false);
  const updateStage = useUpdateCustomStage();

  // Collect all Bitrix24 stage IDs that are already mapped to any custom stage
  const mappedBitrixStageIds = useMemo(() => {
    const ids = new Set<number>();
    if (customStages) {
      for (const stage of customStages) {
        for (const m of stage.mappedStages) {
          ids.add(m.taskStageId);
        }
      }
    }
    return ids;
  }, [customStages]);

  const handleRefreshStages = async () => {
    setRefreshing(true);
    try {
      // Fetch with refresh=true to re-fetch from Bitrix24
      const response = await fetch(`/api/portals/${portalId}/stages?refresh=true`);
      if (response.ok) {
        // Refetch the portal stages query to update UI
        await refetchStages();
      }
    } catch {
      // Silently fail
    } finally {
      setRefreshing(false);
    }
  };

  const handleMoveUp = async (stageIndex: number) => {
    if (!customStages || stageIndex === 0) return;
    const stage = customStages[stageIndex];
    const prevStage = customStages[stageIndex - 1];

    // Swap sort values
    try {
      await updateStage.mutateAsync({
        portalId,
        stageId: stage.id,
        sort: prevStage.sort,
      });
      await updateStage.mutateAsync({
        portalId,
        stageId: prevStage.id,
        sort: stage.sort,
      });
    } catch {
      // Error handled by TanStack Query
    }
  };

  const handleMoveDown = async (stageIndex: number) => {
    if (!customStages || stageIndex === customStages.length - 1) return;
    const stage = customStages[stageIndex];
    const nextStage = customStages[stageIndex + 1];

    // Swap sort values
    try {
      await updateStage.mutateAsync({
        portalId,
        stageId: stage.id,
        sort: nextStage.sort,
      });
      await updateStage.mutateAsync({
        portalId,
        stageId: nextStage.id,
        sort: stage.sort,
      });
    } catch {
      // Error handled by TanStack Query
    }
  };

  const isLoading = isCustomStagesLoading || isPortalStagesLoading;

  if (isLoading) {
    return (
      <div className="bg-surface rounded-card border border-border p-6">
        <h3 className="text-h3 font-semibold mb-4">Стадии канбана</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-input border border-border animate-pulse">
              <div className="w-8 h-8 rounded-input bg-background" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-background rounded w-1/3" />
                <div className="h-3 bg-background rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stages = customStages || [];
  const bitrixStages = portalStages || [];

  return (
    <div className="bg-surface rounded-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-h3 font-semibold">Стадии канбана</h3>
          <p className="text-small text-text-secondary mt-0.5">
            Создавайте пользовательские стадии и привязывайте к ним стадии Bitrix24
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="primary">{stages.length}</Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefreshStages}
            loading={refreshing}
            title="Обновить стадии Bitrix24"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Обновить стадии
          </Button>
        </div>
      </div>

      {/* Create stage form */}
      <div className="mb-4">
        <CreateStageForm portalId={portalId} />
      </div>

      {/* Custom stages list */}
      {stages.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-text-secondary text-small">
            Пользовательских стадий пока нет. Создайте первую стадию для начала привязки.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, index) => (
            <CustomStageRow
              key={stage.id}
              stage={stage}
              portalId={portalId}
              index={index}
              totalStages={stages.length}
              allBitrixStages={bitrixStages}
              mappedBitrixStageIds={mappedBitrixStageIds}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
            />
          ))}
        </div>
      )}

      {/* Unmapped Bitrix24 stages warning */}
      <UnmappedStages
        allBitrixStages={bitrixStages}
        mappedBitrixStageIds={mappedBitrixStageIds}
      />

      {/* Info note */}
      <div className="mt-4 flex items-start gap-2 p-3 rounded-input bg-primary-light/50">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <p className="text-xs text-primary">
          Пользовательские стадии объединяют несколько стадий Bitrix24 в единые колонки канбана.
          Каждая стадия Bitrix24 может быть привязана только к одной пользовательской стадии.
          Используйте &quot;Обновить стадии&quot; для загрузки актуальных стадий из Bitrix24.
        </p>
      </div>
    </div>
  );
}
