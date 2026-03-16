'use client';

import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { TeamMember } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ParticipantSelectorProps {
  members: TeamMember[];
  selectedIds: number[];
  onToggle: (userId: number) => void;
  onSelectAll: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Horizontal row of selectable participant chips.
 * Used in the Free Slots view to filter availability by team members.
 */
export function ParticipantSelector({
  members,
  selectedIds,
  onToggle,
  onSelectAll,
}: ParticipantSelectorProps) {
  const allSelected = members.length > 0 && selectedIds.length === members.length;
  const selectedCount = selectedIds.length;

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Label */}
      <span className="text-[14px] font-semibold text-text-primary shrink-0">
        Участники
      </span>

      {/* Chips row */}
      <div className="flex items-center gap-2 overflow-x-auto flex-nowrap flex-1 min-w-0">
        {/* "All" / count badge */}
        <button
          type="button"
          onClick={onSelectAll}
          className={cn(
            'flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium shrink-0 transition-colors',
            allSelected
              ? 'bg-primary text-white'
              : 'bg-primary-light text-primary border border-primary/20',
          )}
        >
          {allSelected ? 'Все' : `${selectedCount} из ${members.length}`}
        </button>

        {/* Member chips */}
        {members.map((member) => {
          const isSelected = selectedIds.includes(member.userId);

          return (
            <button
              key={member.userId}
              type="button"
              onClick={() => onToggle(member.userId)}
              className={cn(
                'flex items-center gap-1 rounded-full pl-1 pr-3 py-1 text-[12px] font-medium shrink-0 transition-colors',
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-background border border-border text-text-primary hover:border-border-hover',
              )}
            >
              <Avatar
                name={member.name}
                src={member.photo}
                size="sm"
                className="!w-6 !h-6 !text-[10px]"
              />
              <span className="whitespace-nowrap">{member.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
