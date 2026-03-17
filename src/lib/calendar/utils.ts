import type { TaskWithPortal, CalendarTask, FreeSlot } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixels per hour on the time grid */
export const HOUR_HEIGHT = 80;

/** Display hours range (full day for the grid) */
export const DISPLAY_HOURS = { start: 0, end: 24 } as const;

/** Working hours range (used for free slots, availability grid) */
export const WORK_HOURS = { start: 9, end: 18 } as const;

/** Total grid height in pixels: (24 - 0) * 80 = 1920 */
const GRID_HEIGHT = (DISPLAY_HOURS.end - DISPLAY_HOURS.start) * HOUR_HEIGHT;

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

/**
 * Returns Monday 00:00:00 through Sunday 23:59:59.999 for the week
 * containing `date`.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon …
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/** Returns 00:00:00 — 23:59:59.999 of the given day. */
export function getDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// ---------------------------------------------------------------------------
// Pixel calculations
// ---------------------------------------------------------------------------

/**
 * Converts a Date to a vertical pixel offset on the time grid.
 * Result is clamped to [0, GRID_HEIGHT] (0 = 00:00, 1920 = 24:00).
 */
export function timeToPixelOffset(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  const offset = (hours - DISPLAY_HOURS.start) * HOUR_HEIGHT;
  return Math.max(0, Math.min(GRID_HEIGHT, offset));
}

/**
 * Computes the visual block for a task on the calendar grid.
 *
 * Priority:
 *  1. startDatePlan + endDatePlan → full block
 *  2. deadline only → 30-minute block ending at deadline
 *  3. No usable dates → null (task cannot be rendered)
 */
export function getTaskTimeBlock(
  task: TaskWithPortal,
): { startY: number; height: number; startTime: Date; endTime: Date } | null {
  let startTime: Date | null = null;
  let endTime: Date | null = null;

  if (task.startDatePlan && task.endDatePlan) {
    startTime = new Date(task.startDatePlan);
    endTime = new Date(task.endDatePlan);
  } else if (task.deadline) {
    endTime = new Date(task.deadline);
    startTime = new Date(endTime.getTime() - 30 * 60 * 1000); // 30 min before
  }

  if (!startTime || !endTime) return null;

  const startY = timeToPixelOffset(startTime);
  const endY = timeToPixelOffset(endTime);
  const height = Math.max(endY - startY, 24); // minimum 24px

  return { startY, height, startTime, endTime };
}

// ---------------------------------------------------------------------------
// Overlap resolution (greedy column packing)
// ---------------------------------------------------------------------------

/** Maximum visible overlap columns. Tasks beyond this are hidden with a "+N" indicator. */
export const MAX_OVERLAP_COLUMNS = 4;

/**
 * Assigns `columnIndex` and `totalColumns` to overlapping tasks so they
 * can be rendered side-by-side (Google Calendar style).
 *
 * When a cluster has more than MAX_OVERLAP_COLUMNS columns:
 *  - Tasks in columns 0..MAX_OVERLAP_COLUMNS-2 stay visible
 *  - Tasks in column MAX_OVERLAP_COLUMNS-1 and beyond are hidden
 *  - The last visible task in column MAX_OVERLAP_COLUMNS-2 gets
 *    `overflowCount` = number of hidden tasks in the cluster
 *
 * Algorithm:
 *  1. Sort tasks by startY
 *  2. Group overlapping tasks into clusters
 *  3. Within each cluster, greedily assign columns
 *  4. Set totalColumns = max columns in cluster for every task in cluster
 *  5. Cap visible columns and mark overflow
 */
export function resolveOverlaps(tasks: CalendarTask[]): CalendarTask[] {
  if (tasks.length === 0) return [];

  const sorted = [...tasks].sort((a, b) => a.startY - b.startY);

  // Find overlapping clusters
  const clusters: CalendarTask[][] = [];
  let currentCluster: CalendarTask[] = [sorted[0]];
  let clusterEnd = sorted[0].startY + sorted[0].height;

  for (let i = 1; i < sorted.length; i++) {
    const task = sorted[i];
    if (task.startY < clusterEnd) {
      // Overlaps with current cluster
      currentCluster.push(task);
      clusterEnd = Math.max(clusterEnd, task.startY + task.height);
    } else {
      clusters.push(currentCluster);
      currentCluster = [task];
      clusterEnd = task.startY + task.height;
    }
  }
  clusters.push(currentCluster);

  // Assign columns within each cluster
  for (const cluster of clusters) {
    // columns[colIdx] = end-Y of last task in that column
    const columns: number[] = [];

    for (const task of cluster) {
      // Find first column where the task fits (no overlap)
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        if (task.startY >= columns[col]) {
          task.columnIndex = col;
          columns[col] = task.startY + task.height;
          placed = true;
          break;
        }
      }
      if (!placed) {
        task.columnIndex = columns.length;
        columns.push(task.startY + task.height);
      }
    }

    const actualColumns = columns.length;

    // If cluster exceeds max columns, cap and mark overflow
    if (actualColumns > MAX_OVERLAP_COLUMNS) {
      const cappedColumns = MAX_OVERLAP_COLUMNS;
      let hiddenTaskCount = 0;

      // Mark tasks in columns >= MAX_OVERLAP_COLUMNS - 1 as hidden
      // (keep 0..MAX_OVERLAP_COLUMNS-2 visible, hide the rest)
      for (const task of cluster) {
        if ((task.columnIndex ?? 0) >= cappedColumns - 1) {
          task.hidden = true;
          hiddenTaskCount++;
        }
        task.totalColumns = cappedColumns;
      }

      // Find the last visible task (in column cappedColumns - 2) and set overflowCount
      // We pick the first task in the highest visible column as the carrier
      const lastVisibleCol = cappedColumns - 2;
      const carrier = cluster.find(
        (t) => (t.columnIndex ?? 0) === lastVisibleCol && !t.hidden,
      );
      if (carrier) {
        carrier.overflowCount = hiddenTaskCount;
      } else {
        // Fallback: set on last non-hidden task
        const visible = cluster.filter((t) => !t.hidden);
        if (visible.length > 0) {
          visible[visible.length - 1].overflowCount = hiddenTaskCount;
        }
      }
    } else {
      for (const task of cluster) {
        task.totalColumns = actualColumns;
      }
    }
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Free slots algorithm
// ---------------------------------------------------------------------------

/**
 * Finds free time slots when all specified users are available.
 *
 * Scans working hours in 30-minute increments, builds a busy bitmap per user,
 * then finds windows where everyone is free and groups consecutive free
 * increments into slots of at least `slotDuration` minutes.
 */
export function findFreeSlots(
  tasks: TaskWithPortal[],
  userIds: string[],
  dateRange: { start: Date; end: Date },
  slotDuration: number,
  workHours: { start: number; end: number } = WORK_HOURS,
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const INCREMENT = 30; // minutes
  const workMinutesPerDay = (workHours.end - workHours.start) * 60;
  const slotsPerDay = workMinutesPerDay / INCREMENT;

  // Iterate day by day
  const current = new Date(dateRange.start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(dateRange.end);
  endDate.setHours(23, 59, 59, 999);

  while (current <= endDate) {
    // Skip weekends
    const dow = current.getDay();
    if (dow === 0 || dow === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Build busy bitmap for this day: true = at least one user is busy
    const busy = new Array<boolean>(slotsPerDay).fill(false);

    for (let slotIdx = 0; slotIdx < slotsPerDay; slotIdx++) {
      const slotStart = new Date(current);
      slotStart.setHours(workHours.start, slotIdx * INCREMENT, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + INCREMENT);

      for (const uid of userIds) {
        const userBusy = tasks.some((t) => {
          if (t.responsibleId !== uid) return false;
          const block = getTaskTimeBlock(t);
          if (!block) return false;
          // Overlap check: slot overlaps task if slotStart < taskEnd && slotEnd > taskStart
          return slotStart < block.endTime && slotEnd > block.startTime;
        });
        if (userBusy) {
          busy[slotIdx] = true;
          break;
        }
      }
    }

    // Find consecutive free windows >= slotDuration
    let freeStart: number | null = null;
    for (let i = 0; i <= slotsPerDay; i++) {
      const isBusy = i === slotsPerDay || busy[i];
      if (!isBusy && freeStart === null) {
        freeStart = i;
      } else if (isBusy && freeStart !== null) {
        const freeMinutes = (i - freeStart) * INCREMENT;
        if (freeMinutes >= slotDuration) {
          const startTime = new Date(current);
          startTime.setHours(workHours.start, freeStart * INCREMENT, 0, 0);
          const endTime = new Date(current);
          endTime.setHours(workHours.start, i * INCREMENT, 0, 0);

          slots.push({
            date: new Date(current),
            startTime,
            endTime,
            durationMinutes: freeMinutes,
            isBest: false,
          });
        }
        freeStart = null;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  // Mark the longest slot as best
  if (slots.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].durationMinutes > slots[bestIdx].durationMinutes) {
        bestIdx = i;
      }
    }
    slots[bestIdx].isBest = true;
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Busy level
// ---------------------------------------------------------------------------

/**
 * Returns the number of busy users at a given day + hour.
 * Used by AvailabilityGrid to colour cells.
 */
export function getBusyLevel(
  tasks: TaskWithPortal[],
  userIds: string[],
  day: Date,
  hour: number,
  _workHours: { start: number; end: number } = WORK_HOURS,
): number {
  const slotStart = new Date(day);
  slotStart.setHours(hour, 0, 0, 0);
  const slotEnd = new Date(day);
  slotEnd.setHours(hour + 1, 0, 0, 0);

  let busyCount = 0;
  for (const uid of userIds) {
    const isBusy = tasks.some((t) => {
      if (t.responsibleId !== uid) return false;
      const block = getTaskTimeBlock(t);
      if (!block) return false;
      return slotStart < block.endTime && slotEnd > block.startTime;
    });
    if (isBusy) busyCount++;
  }

  return busyCount;
}

// ---------------------------------------------------------------------------
// Date formatting (Russian locale)
// ---------------------------------------------------------------------------

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
] as const;

const MONTH_NAMES_RU_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

const DAY_SHORT_NAMES_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

/** Returns the ISO week number (1-53) for a date. */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** e.g. "12 неделя, Март 2026" */
export function formatWeekLabel(date: Date): string {
  const weekNum = getISOWeekNumber(date);
  const month = MONTH_NAMES_RU[date.getMonth()];
  return `${weekNum} неделя, ${month} ${date.getFullYear()}`;
}

/** e.g. "17 марта 2026" */
export function formatDayLabel(date: Date): string {
  const day = date.getDate();
  const month = MONTH_NAMES_RU_GENITIVE[date.getMonth()];
  return `${day} ${month} ${date.getFullYear()}`;
}

/** e.g. "Пн", "Вт", etc. */
export function getDayShortName(date: Date): string {
  return DAY_SHORT_NAMES_RU[date.getDay()];
}

/** True if `date` is today (comparing year/month/day). */
export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** True if two dates fall on the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** True if `date` is Saturday (6) or Sunday (0). */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
