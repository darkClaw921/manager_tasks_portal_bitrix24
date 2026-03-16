'use client';

import { useMemo, useCallback } from 'react';
import { useCalendarStore } from '@/stores/calendar-store';
import { usePortalStore } from '@/stores/portal-store';
import { useCalendarTasks, useTeamDay } from '@/hooks/useCalendarTasks';
import { getWeekRange, findFreeSlots } from '@/lib/calendar/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { FreeSlot, TeamMember } from '@/types';

import { ParticipantSelector } from './ParticipantSelector';
import { AvailabilityGrid } from './AvailabilityGrid';
import { SlotCard } from './SlotCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DURATION_OPTIONS: { value: 30 | 60 | 120; label: string }[] = [
  { value: 30, label: '30 мин' },
  { value: 60, label: '1 час' },
  { value: 120, label: '2 часа' },
];

const MAX_VISIBLE_SLOTS = 15;

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function ZapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function UsersEmptyIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CalendarEmptyIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Duration format helper
// ---------------------------------------------------------------------------

function formatSlotDurationLabel(minutes: number): string {
  if (minutes === 30) return '30 минут';
  if (minutes === 60) return '1 час';
  if (minutes === 120) return '2 часа';
  return `${minutes} мин`;
}

// ---------------------------------------------------------------------------
// Helper: map app userId to bitrix userId
// ---------------------------------------------------------------------------

function getBitrixUserIds(
  members: TeamMember[],
  selectedAppUserIds: number[],
): string[] {
  return members
    .filter((m) => selectedAppUserIds.includes(m.userId))
    .map((m) => m.bitrixUserId);
}

// ---------------------------------------------------------------------------
// Helper: ISO date string
// ---------------------------------------------------------------------------

function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function FreeSlotsViewSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row h-full animate-pulse">
      <div className="flex-1 p-6 flex flex-col gap-5">
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="flex-1">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
      <div className="w-full lg:w-[340px] p-6 border-t lg:border-t-0 lg:border-l border-border">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-4 w-full mb-4" />
        <Skeleton className="h-9 w-full rounded-lg mb-4" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg mb-2" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FreeSlotsView Component
// ---------------------------------------------------------------------------

export function FreeSlotsView() {
  const currentDate = useCalendarStore((s) => s.currentDate);
  const selectedUserIds = useCalendarStore((s) => s.selectedUserIds);
  const slotDuration = useCalendarStore((s) => s.slotDuration);
  const toggleUser = useCalendarStore((s) => s.toggleUser);
  const setSelectedUserIds = useCalendarStore((s) => s.setSelectedUserIds);
  const setSlotDuration = useCalendarStore((s) => s.setSlotDuration);
  const activePortalId = usePortalStore((s) => s.activePortalId);

  // Compute date ranges
  const date = useMemo(() => new Date(currentDate), [currentDate]);
  const weekRange = useMemo(() => getWeekRange(date), [date]);

  const dateFrom = weekRange.start.toISOString();
  const dateTo = weekRange.end.toISOString();

  // Fetch tasks for the entire week
  const {
    data: tasksData,
    isLoading: tasksLoading,
  } = useCalendarTasks(dateFrom, dateTo, activePortalId ?? undefined);

  // Fetch team members (using a representative day — Monday of the week)
  const teamDate = toISODateString(weekRange.start);
  const {
    data: teamData,
    isLoading: teamLoading,
  } = useTeamDay(teamDate, activePortalId ?? undefined);

  const members = teamData?.members ?? [];
  const tasks = tasksData?.data ?? [];

  // Map selected app userIds to Bitrix userIds
  const bitrixUserIds = useMemo(
    () => getBitrixUserIds(members, selectedUserIds),
    [members, selectedUserIds],
  );

  // Compute free slots
  const freeSlots = useMemo(() => {
    if (bitrixUserIds.length === 0) return [];
    return findFreeSlots(tasks, bitrixUserIds, weekRange, slotDuration);
  }, [tasks, bitrixUserIds, weekRange, slotDuration]);

  // Limit visible slots
  const visibleSlots = useMemo(
    () => freeSlots.slice(0, MAX_VISIBLE_SLOTS),
    [freeSlots],
  );

  // Handlers
  const handleSelectAll = useCallback(() => {
    if (selectedUserIds.length === members.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(members.map((m) => m.userId));
    }
  }, [members, selectedUserIds.length, setSelectedUserIds]);

  const handleBook = useCallback((slot: FreeSlot) => {
    // Future feature: open booking modal
    const startStr = `${String(slot.startTime.getHours()).padStart(2, '0')}:${String(slot.startTime.getMinutes()).padStart(2, '0')}`;
    const endStr = `${String(slot.endTime.getHours()).padStart(2, '0')}:${String(slot.endTime.getMinutes()).padStart(2, '0')}`;
    alert(`Забронировать слот: ${startStr} — ${endStr}`);
  }, []);

  // Loading state
  if (tasksLoading || teamLoading) {
    return <FreeSlotsViewSkeleton />;
  }

  const hasParticipantsSelected = selectedUserIds.length > 0;
  const slotCount = freeSlots.length;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ===== Left Panel: Participants + Availability Grid ===== */}
      <div className="flex-1 p-6 flex flex-col gap-5 overflow-hidden">
        <ParticipantSelector
          members={members}
          selectedIds={selectedUserIds}
          onToggle={toggleUser}
          onSelectAll={handleSelectAll}
        />

        {hasParticipantsSelected ? (
          <AvailabilityGrid
            tasks={tasks}
            selectedUserIds={bitrixUserIds}
            weekStart={weekRange.start}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<UsersEmptyIcon />}
              title="Выберите участников"
              description="Выберите участников для поиска свободных слотов"
            />
          </div>
        )}
      </div>

      {/* ===== Right Panel: Recommended Slots ===== */}
      <div className="w-full lg:w-[340px] p-5 flex flex-col gap-4 bg-surface border-t lg:border-t-0 lg:border-l border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-success">
            <ZapIcon />
          </span>
          <span className="text-[15px] font-bold text-text-primary">
            Рекомендуемые слоты
          </span>
          {slotCount > 0 && (
            <span className="bg-success-light text-success text-[11px] font-semibold rounded-[10px] px-2 py-0.5">
              {slotCount}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[12px] text-text-secondary leading-relaxed">
          Время, когда все выбранные участники свободны для встречи
          на {formatSlotDurationLabel(slotDuration)}
        </p>

        {/* Duration filter tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSlotDuration(opt.value)}
              className={cn(
                'flex-1 py-2 text-[12px] font-medium transition-colors',
                slotDuration === opt.value
                  ? 'bg-success text-white font-semibold'
                  : 'bg-surface text-text-secondary hover:bg-background',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Slot list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
          {!hasParticipantsSelected ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-[12px] text-text-muted text-center">
                Выберите участников для поиска свободных слотов
              </p>
            </div>
          ) : visibleSlots.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <EmptyState
                icon={<CalendarEmptyIcon />}
                title="Свободных слотов не найдено"
                description="Попробуйте увеличить период или уменьшить длительность"
              />
            </div>
          ) : (
            visibleSlots.map((slot, i) => (
              <SlotCard
                key={`${slot.date.toISOString()}-${slot.startTime.toISOString()}-${i}`}
                slot={slot}
                onBook={handleBook}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
