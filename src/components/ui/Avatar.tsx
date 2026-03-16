import { cn } from '@/lib/utils';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-small',
  lg: 'w-12 h-12 text-body',
};

/** Generate a deterministic background color from a name string */
function getColorFromName(name: string): string {
  const colors = [
    '#8B5CF6', // purple
    '#06B6D4', // cyan
    '#F97316', // orange
    '#2563EB', // blue
    '#16A34A', // green
    '#DC2626', // red
    '#F59E0B', // amber
    '#EC4899', // pink
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

/** Get initials from a name (first letter of first and last name) */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          'rounded-full object-cover shrink-0',
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white shrink-0 select-none',
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: bgColor }}
      title={name}
    >
      {initials}
    </div>
  );
}
