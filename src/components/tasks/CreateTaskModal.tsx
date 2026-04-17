'use client';

import { useState, useEffect, useMemo, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { usePortals } from '@/hooks/usePortals';
import { useCreateTask } from '@/hooks/useTasks';
import { useUsers } from '@/hooks/useUsers';
import { usePortalStore } from '@/stores/portal-store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { TextareaField } from '@/components/ui/TextareaField';
import { SelectField } from '@/components/ui/SelectField';
import { PortalIndicator } from '@/components/ui/PortalIndicator';
import { useToast } from '@/components/ui/Toast';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadTaskFile(taskId: number, file: File): Promise<void> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/tasks/${taskId}/files`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed: ${res.status}`);
  }
}

const PRIORITY_OPTIONS = [
  { value: '0', label: 'Низкий' },
  { value: '1', label: 'Средний' },
  { value: '2', label: 'Высокий' },
];

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function CreateTaskModal() {
  const { activeModal, closeModal, createTaskPrefill, clearCreateTaskPrefill } = useUIStore();
  const { data: portals } = usePortals();
  const { activePortalId } = usePortalStore();
  const createTask = useCreateTask();

  const [portalId, setPortalId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('1');
  const [deadline, setDeadline] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Файлы, выбранные через блок «Вложения» — видим только для local portal.
  const [files, setFiles] = useState<File[]>([]);
  // Активен ли последовательный upload файлов после создания задачи.
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isOpen = activeModal === 'createTask';

  /**
   * Latch: did we already apply the current `createTaskPrefill` payload to
   * the form? We only want prefill to flow into title/description once per
   * open transition so subsequent re-renders (user typing, portal switch,
   * etc.) do not clobber the user's input. The latch is reset both when the
   * modal closes and when the prefill reference itself changes.
   */
  const prefillAppliedRef = useRef<boolean>(false);

  // Set default portal when modal opens
  useEffect(() => {
    if (isOpen) {
      if (activePortalId) {
        setPortalId(String(activePortalId));
      } else if (portals && portals.length > 0) {
        setPortalId(String(portals[0].id));
      }
    }
  }, [isOpen, activePortalId, portals]);

  // Apply prefill exactly once per open. Runs on the render where
  // `isOpen` is true and the latch is still false.
  useEffect(() => {
    if (!isOpen) return;
    if (prefillAppliedRef.current) return;
    if (!createTaskPrefill) return;
    if (createTaskPrefill.title !== undefined) {
      setTitle(createTaskPrefill.title);
    }
    if (createTaskPrefill.description !== undefined) {
      setDescription(createTaskPrefill.description);
    }
    prefillAppliedRef.current = true;
  }, [isOpen, createTaskPrefill]);

  // Reset form when modal closes. Also clears the ui-store prefill so the
  // next independent open starts from an empty baseline — feeders that want
  // prefill must call `setCreateTaskPrefill(...)` again before `openModal`.
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setDescription('');
      setPriority('1');
      setDeadline('');
      setResponsibleId('');
      setTagsInput('');
      setFiles([]);
      setUploadingFiles(false);
      setErrors({});
      prefillAppliedRef.current = false;
      clearCreateTaskPrefill();
    }
  }, [isOpen, clearCreateTaskPrefill]);

  // Clear responsibleId when switching portal type (bitrix <-> local)
  // since the id semantics differ (bitrix user id vs app user id)
  useEffect(() => {
    setResponsibleId('');
  }, [portalId]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!portalId) newErrors.portalId = 'Выберите портал';
    if (!title.trim()) newErrors.title = 'Введите название задачи';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked]);
    // Сбрасываем input чтобы тот же файл можно было выбрать повторно.
    e.target.value = '';
  }

  function removeFileAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    createTask.mutate(
      {
        portalId: parseInt(portalId, 10),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        deadline: deadline || undefined,
        responsibleId: responsibleId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      },
      {
        onSuccess: async (task) => {
          // Для локальных задач — последовательно грузим файлы.
          // Задача УЖЕ создана; ошибки отдельных upload не откатывают её,
          // просто показываем toast и закрываем модалку.
          if (isLocal && files.length > 0 && task?.id) {
            setUploadingFiles(true);
            const failed: string[] = [];
            for (const f of files) {
              try {
                await uploadTaskFile(task.id, f);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'unknown';
                failed.push(`${f.name}: ${msg}`);
              }
            }
            setUploadingFiles(false);
            if (failed.length > 0) {
              toast('error', `Не удалось загрузить ${failed.length} из ${files.length}: ${failed.join('; ')}`);
            }
          }
          closeModal();
        },
      }
    );
  }

  const selectedPortal = portals?.find((p) => p.id === parseInt(portalId, 10));
  const isLocal = selectedPortal?.domain === 'local';

  // App users loaded only when a local portal is selected (lazy)
  const { data: appUsers } = useUsers();

  const responsibleOptions = useMemo(() => {
    if (!isLocal) return [] as Array<{ value: string; label: string }>;
    return (appUsers || []).map((u) => {
      const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
      return { value: String(u.id), label: name };
    });
  }, [isLocal, appUsers]);

  if (!isOpen) return null;

  const portalOptions = (portals || []).map((p) => ({
    value: String(p.id),
    label: p.name || p.domain,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="relative bg-surface rounded-modal w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-h3 font-semibold text-foreground">Создать задачу</h2>
          <button
            type="button"
            onClick={closeModal}
            className="p-1.5 text-text-secondary hover:text-foreground transition-colors rounded-input hover:bg-background"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Portal select */}
          <div>
            <label className="block text-small font-medium text-foreground mb-1.5">
              Портал <span className="text-danger">*</span>
            </label>
            <div className="flex items-center gap-2">
              {selectedPortal && (
                <PortalIndicator color={selectedPortal.color} size="md" />
              )}
              <div className="flex-1">
                <SelectField
                  options={portalOptions}
                  placeholder="Выберите портал"
                  value={portalId}
                  onChange={(e) => setPortalId(e.target.value)}
                  error={errors.portalId}
                />
              </div>
              {isLocal && (
                <Badge variant="primary" size="sm">
                  Локальная
                </Badge>
              )}
            </div>
          </div>

          {/* Title */}
          <InputField
            label="Название"
            placeholder="Введите название задачи"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            required
          />

          {/* Description */}
          <TextareaField
            label="Описание"
            placeholder="Описание задачи..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Priority + Deadline row */}
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Приоритет"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
            <InputField
              label="Дедлайн"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {/* Responsible */}
          {isLocal ? (
            <SelectField
              label="Ответственный"
              options={responsibleOptions}
              placeholder="Выберите пользователя"
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
              helperText="Пользователь приложения"
            />
          ) : (
            <InputField
              label="Ответственный (ID)"
              placeholder="ID пользователя в Bitrix24"
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
              helperText="ID пользователя из Bitrix24 портала"
            />
          )}

          {/* Tags */}
          <InputField
            label="Теги"
            placeholder="тег1, тег2, тег3"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            helperText="Через запятую"
          />

          {/* Attachments — только для локального портала */}
          {isLocal && (
            <div>
              <label className="block text-small font-medium text-foreground mb-1.5">
                Вложения
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Выбрать файлы
                </Button>
                <span className="text-small text-text-secondary">
                  {files.length > 0
                    ? `${files.length} ${files.length === 1 ? 'файл' : 'файлов'}`
                    : 'Можно несколько (до 25 MB каждый)'}
                </span>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((file, idx) => (
                    <li
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded-input bg-background text-small"
                    >
                      <span className="truncate">
                        {file.name}
                        <span className="ml-2 text-xs text-text-muted">
                          {formatBytes(file.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFileAt(idx)}
                        className="p-1 text-text-secondary hover:text-danger transition-colors"
                        aria-label="Удалить"
                      >
                        <CloseIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Error message */}
          {createTask.isError && (
            <p className="text-small text-danger">
              {createTask.error instanceof Error
                ? createTask.error.message
                : 'Ошибка при создании задачи'}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              disabled={createTask.isPending || uploadingFiles}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={createTask.isPending || uploadingFiles}
            >
              Создать
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
