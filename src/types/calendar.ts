import type { TaskWithPortal } from './task';

/** Available calendar view modes */
export type CalendarView = 'week' | 'team-day' | 'free-slots';

/**
 * Task extended with computed positioning fields for calendar rendering.
 * startY/height are pixel values for absolute positioning on the time grid.
 * columnIndex/totalColumns handle overlap layout (Google Calendar-style column packing).
 * hidden: true when there are > MAX_OVERLAP_COLUMNS overlapping tasks (overflow).
 * overflowCount: on the last visible column task, how many tasks are hidden in this cluster.
 */
export interface CalendarTask extends TaskWithPortal {
  startY: number;
  height: number;
  startTime: Date;
  endTime: Date;
  columnIndex?: number;
  totalColumns?: number;
  hidden?: boolean;
  overflowCount?: number;
}

/** A free time slot found by the availability algorithm */
export interface FreeSlot {
  date: Date;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  isBest: boolean;
}

/** A team member for the team-day view */
export interface TeamMember {
  userId: number;
  bitrixUserId: string;
  name: string;
  email: string;
  portalId: number;
  portalName: string;
  portalColor: string;
  photo?: string | null;
  position?: string | null;
}
