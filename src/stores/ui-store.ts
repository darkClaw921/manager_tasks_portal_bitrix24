import { create } from 'zustand';

export type ActiveModal = 'createTask' | 'filters' | null;

interface UIState {
  sidebarOpen: boolean;
  activeModal: ActiveModal;
  globalSearch: string;
  globalStatusFilter: string;
  globalPriorityFilter: string;
  globalDateFrom: string;
  globalDateTo: string;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  setGlobalSearch: (search: string) => void;
  setGlobalStatusFilter: (status: string) => void;
  setGlobalPriorityFilter: (priority: string) => void;
  setGlobalDateFrom: (date: string) => void;
  setGlobalDateTo: (date: string) => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;
}

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarOpen: false,
  activeModal: null,
  globalSearch: '',
  globalStatusFilter: '',
  globalPriorityFilter: '',
  globalDateFrom: '',
  globalDateTo: '',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  setGlobalSearch: (search) => set({ globalSearch: search }),
  setGlobalStatusFilter: (status) => set({ globalStatusFilter: status }),
  setGlobalPriorityFilter: (priority) => set({ globalPriorityFilter: priority }),
  setGlobalDateFrom: (date) => set({ globalDateFrom: date }),
  setGlobalDateTo: (date) => set({ globalDateTo: date }),
  clearFilters: () => set({
    globalStatusFilter: '',
    globalPriorityFilter: '',
    globalDateFrom: '',
    globalDateTo: '',
  }),
  hasActiveFilters: () => {
    const state = get();
    return !!(state.globalStatusFilter || state.globalPriorityFilter || state.globalDateFrom || state.globalDateTo);
  },
}));
