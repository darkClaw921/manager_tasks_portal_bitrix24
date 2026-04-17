'use client';

/**
 * Workspaces list page (`/workspaces`).
 *
 * Mirrors the meetings list: a header with icon title, primary CTA, then a
 * skeleton / empty state / card grid. Cards click through to
 * `/workspaces/<id>`.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWorkspaces, useDeleteWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/components/ui/Toast';
import { CreateWorkspaceModal } from '@/components/workspaces/CreateWorkspaceModal';
import type { Workspace } from '@/types/workspace';

function BoardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-6 h-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6h6m-6 4h6m-6 4h6M3.75 19.5h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z"
      />
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface CardProps {
  workspace: Workspace;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

function WorkspaceCard({ workspace, onOpen, onDelete, isDeleting }: CardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body font-semibold text-foreground">
            {workspace.title}
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Создана {formatDate(workspace.createdAt)}
          </p>
          <p className="text-xs text-text-secondary">
            Обновлена {formatDate(workspace.updatedAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isDeleting}
          onClick={() => onDelete(workspace.id)}
        >
          Удалить
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={() => onOpen(workspace.id)}>
          Открыть
        </Button>
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useWorkspaces();
  const deleteWs = useDeleteWorkspace();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpenDialog = useCallback(() => setDialogOpen(true), []);
  const handleCloseDialog = useCallback(() => setDialogOpen(false), []);

  const handleOpen = useCallback(
    (id: number) => {
      router.push(`/workspaces/${id}`);
    },
    [router]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm('Удалить доску? Данные нельзя будет восстановить.')) return;
      try {
        await deleteWs.mutateAsync(id);
        toast('success', 'Доска удалена');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось удалить';
        toast('error', message);
      }
    },
    [deleteWs, toast]
  );

  const handleCreated = useCallback(
    (ws: Workspace) => {
      setDialogOpen(false);
      router.push(`/workspaces/${ws.id}`);
    },
    [router]
  );

  const workspaces = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-card bg-primary-light flex items-center justify-center text-primary">
            <BoardIcon />
          </div>
          <div>
            <h1 className="text-h2 font-bold text-foreground">Доски</h1>
            <p className="text-small text-text-secondary">
              Совместные интерактивные доски с realtime-коллаборацией
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenDialog}>
          Новая доска
        </Button>
      </div>

      {isError && (
        <div className="rounded-card border border-danger bg-red-50 p-3 text-body text-danger">
          {error instanceof Error ? error.message : 'Не удалось загрузить доски'}
          <div className="mt-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => refetch()}>
              Повторить
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!isLoading && !isError && workspaces.length === 0 && (
        <EmptyState
          title="Досок пока нет"
          description="Создайте первую доску, чтобы пригласить коллег для совместной работы"
          actionLabel="Создать доску"
          onAction={handleOpenDialog}
        />
      )}

      {!isLoading && workspaces.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onOpen={handleOpen}
              onDelete={handleDelete}
              isDeleting={deleteWs.isPending}
            />
          ))}
        </div>
      )}

      <CreateWorkspaceModal
        open={dialogOpen}
        onClose={handleCloseDialog}
        onCreated={handleCreated}
      />
    </div>
  );
}
