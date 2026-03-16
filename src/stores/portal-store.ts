import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortalPublic } from '@/types';

interface PortalState {
  portals: PortalPublic[];
  activePortalId: number | null;
  setPortals: (portals: PortalPublic[]) => void;
  setActivePortalId: (id: number | null) => void;
  addPortal: (portal: PortalPublic) => void;
  removePortal: (id: number) => void;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      portals: [],
      activePortalId: null,
      setPortals: (portals) => set({ portals }),
      setActivePortalId: (id) => set({ activePortalId: id }),
      addPortal: (portal) =>
        set((state) => ({ portals: [...state.portals, portal] })),
      removePortal: (id) =>
        set((state) => ({
          portals: state.portals.filter((p) => p.id !== id),
          activePortalId: state.activePortalId === id ? null : state.activePortalId,
        })),
    }),
    {
      name: 'taskhub-portal-store',
      partialize: (state) => ({
        activePortalId: state.activePortalId,
      }),
    }
  )
);
