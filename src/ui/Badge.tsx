import type { ReactNode } from 'react';

export function Badge({
  children,
  variant = 'outline',
  title,
}: {
  children: ReactNode;
  variant?: 'outline' | 'solid' | 'dashed';
  title?: string;
}) {
  const cls = variant === 'solid' ? 'badge badge--solid' : variant === 'dashed' ? 'badge badge--dashed' : 'badge';
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

/** Where a value came from. Always visible, never hover-only. */
export function SourceBadge({ source }: { source: 'SYNTHETIC' | 'MANUAL' }) {
  return <Badge variant={source === 'MANUAL' ? 'solid' : 'dashed'}>{source}</Badge>;
}
