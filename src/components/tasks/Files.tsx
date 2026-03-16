'use client';

import type { TaskFile } from '@/types';

export interface FilesProps {
  files: TaskFile[];
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Files({ files }: FilesProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-h3 font-semibold text-foreground">
        Файлы
        {files.length > 0 && (
          <span className="text-text-secondary font-normal ml-2">
            ({files.length})
          </span>
        )}
      </h3>

      {files.length === 0 ? (
        <p className="text-small text-text-muted py-2">Файлов нет</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-card bg-background group"
            >
              <div className="shrink-0 text-text-muted">
                <FileIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body text-foreground font-medium truncate">
                  {file.name}
                </p>
                <div className="flex items-center gap-2">
                  {file.size && (
                    <span className="text-xs text-text-muted">
                      {formatFileSize(file.size)}
                    </span>
                  )}
                  {file.contentType && (
                    <span className="text-xs text-text-muted">
                      {file.contentType}
                    </span>
                  )}
                </div>
              </div>
              {file.downloadUrl && (
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 text-text-muted hover:text-primary transition-colors rounded-input hover:bg-surface"
                  title="Скачать"
                >
                  <DownloadIcon />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
