import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CalendarView } from '@/types';

interface CalendarState {
  /** Active calendar view mode */
  view: CalendarView;
  /** Currently displayed date (ISO string) */
  currentDate: string;
  /** Selected user IDs for team/free-slots views */
  selectedUserIds: number[];
  /** Slot duration in minutes for free-slots view */
  slotDuration: 30 | 60 | 120;

  // Actions
  setView: (view: CalendarView) => void;
  setCurrentDate: (date: string) => void;
  goToToday: () => void;
  navigateWeek: (direction: -1 | 1) => void;
  navigateDay: (direction: -1 | 1) => void;
  toggleUser: (userId: number) => void;
  setSelectedUserIds: (ids: number[]) => void;
  setSlotDuration: (minutes: 30 | 60 | 120) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      view: 'week',
      currentDate: new Date().toISOString(),
      selectedUserIds: [],
      slotDuration: 60,

      setView: (view) => set({ view }),

      setCurrentDate: (date) => set({ currentDate: date }),

      goToToday: () => set({ currentDate: new Date().toISOString() }),

      navigateWeek: (direction) =>
        set((state) => {
          const d = new Date(state.currentDate);
          d.setDate(d.getDate() + direction * 7);
          return { currentDate: d.toISOString() };
        }),

      navigateDay: (direction) =>
        set((state) => {
          const d = new Date(state.currentDate);
          d.setDate(d.getDate() + direction);
          return { currentDate: d.toISOString() };
        }),

      toggleUser: (userId) =>
        set((state) => {
          const ids = state.selectedUserIds;
          const exists = ids.includes(userId);
          return {
            selectedUserIds: exists
              ? ids.filter((id) => id !== userId)
              : [...ids, userId],
          };
        }),

      setSelectedUserIds: (ids) => set({ selectedUserIds: ids }),

      setSlotDuration: (minutes) => set({ slotDuration: minutes }),
    }),
    {
      name: 'taskhub-calendar-store',
      partialize: (state) => ({
        view: state.view,
        slotDuration: state.slotDuration,
        selectedUserIds: state.selectedUserIds,
      }),
    }
  )
);
