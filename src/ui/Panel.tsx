import type { ReactNode } from 'react';

export function Panel({
  title,
  icon,
  hint,
  children,
  id,
  className,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={`panel${className ? ` ${className}` : ''}`} aria-labelledby={headingId} id={id}>
      <h2 className="panel__title" id={headingId}>
        {icon}
        {title}
      </h2>
      {hint ? <p className="panel__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
