'use client';

import { Avatar } from '@/components/ui/Avatar';
import type { TeamMember } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamMemberHeaderProps {
  member: TeamMember;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Column header for a team member in the Team Day view.
 * Displays avatar + name + position/email in a compact horizontal layout.
 */
export function TeamMemberHeader({ member }: TeamMemberHeaderProps) {
  const subtitle = member.position || member.email;

  return (
    <div className="flex items-center gap-2 px-3 h-14 min-w-[120px]">
      <Avatar
        name={member.name}
        src={member.photo}
        size="sm"
      />
      <div className="flex flex-col gap-px min-w-0">
        <span className="text-[12px] font-semibold text-primary truncate">
          {member.name}
        </span>
        {subtitle && (
          <span className="text-[10px] text-text-secondary truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
