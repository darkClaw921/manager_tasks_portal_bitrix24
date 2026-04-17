import { create } from 'zustand';

export type ActiveModal = 'createTask' | 'filters' | null;

/**
 * Shape of the prefill payload consumed by `CreateTaskModal` on open.
 *
 * Feeders (e.g. the meeting-recording "Create task" button) set this just
 * before calling `openModal('createTask')`. The modal reads it once in a
 * `useEffect`, initialises its form fields, and must call
 * `clearCreateTaskPrefill()` on close so the next independent open of the
 * modal starts from empty fields.
 */
export interface CreateTaskPrefill {
  title?: string;
  description?: string;
}

interface UIState {
  sidebarOpen: boolean;
  activeModal: ActiveModal;
  sidePanelTaskId: number | null;
  globalSearch: string;
  globalStatusFilter: string;
  globalPriorityFilter: string;
  globalDateFrom: string;
  globalDateTo: string;
  createTaskPrefill: CreateTaskPrefill | null;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  openSidePanel: (taskId: number) => void;
  closeSidePanel: () => void;
  setGlobalSearch: (search: string) => void;
  setGlobalStatusFilter: (status: string) => void;
  setGlobalPriorityFilter: (priority: string) => void;
  setGlobalDateFrom: (date: string) => void;
  setGlobalDateTo: (date: string) => void;
  clearFilters: () => void;
  hasActiveFilters: () => boolean;
  setCreateTaskPrefill: (prefill: CreateTaskPrefill | null) => void;
  clearCreateTaskPrefill: () => void;
}

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarOpen: false,
  activeModal: null,
  sidePanelTaskId: null,
  globalSearch: '',
  globalStatusFilter: '',
  globalPriorityFilter: '',
  globalDateFrom: '',
  globalDateTo: '',
  createTaskPrefill: null,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  openSidePanel: (taskId) => set({ sidePanelTaskId: taskId }),
  closeSidePanel: () => set({ sidePanelTaskId: null }),
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
  setCreateTaskPrefill: (prefill) => set({ createTaskPrefill: prefill }),
  clearCreateTaskPrefill: () => set({ createTaskPrefill: null }),
}));
