'use client';

/**
 * Asset upload + AI-image generation client helpers.
 *
 * Two thin wrappers, each returning a small `{ run, isLoading, error }`
 * shape so the callers can render their own UI states. We avoid
 * TanStack Query mutations on purpose — these flows are one-shot
 * (no caching to invalidate) and the file inputs / dialogs already
 * track their own state.
 */

import { useCallback, useState } from 'react';

export interface UploadAssetResult {
  assetId: number;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface UseUploadAssetReturn {
  /** Upload a single file. Throws on transport / validation error. */
  upload: (file: File) => Promise<UploadAssetResult>;
  isLoading: boolean;
  error: string | null;
}

export function useUploadAsset(workspaceId: number): UseUploadAssetReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadAssetResult> => {
      setIsLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/workspaces/${workspaceId}/assets/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const json = await res
          .json()
          .catch(() => null) as { data?: UploadAssetResult; message?: string } | null;
        if (!res.ok || !json?.data) {
          const msg = json?.message || `Upload failed: ${res.status}`;
          throw new Error(msg);
        }
        return json.data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId]
  );

  return { upload, isLoading, error };
}

export type GenerateImageResult = UploadAssetResult;

export interface UseGenerateImageReturn {
  /** Generate an image via AI. Throws on transport / AI error. */
  generate: (prompt: string) => Promise<GenerateImageResult>;
  isLoading: boolean;
  error: string | null;
}

export function useGenerateImage(workspaceId: number): UseGenerateImageReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (prompt: string): Promise<GenerateImageResult> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/ai/image`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const json = (await res.json().catch(() => null)) as
          | { data?: GenerateImageResult; message?: string }
          | null;
        if (!res.ok || !json?.data) {
          const msg = json?.message || `Image generation failed: ${res.status}`;
          throw new Error(msg);
        }
        return json.data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image generation failed';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId]
  );

  return { generate, isLoading, error };
}
