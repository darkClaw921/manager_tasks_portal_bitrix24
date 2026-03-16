import { create } from 'zustand';

export type ActiveModal = 'createTask' | 'filters' | null;

interface UIState {
  sidebarOpen: boolean;
  activeModal: ActiveModal;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: false,
  activeModal: null,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
}));
