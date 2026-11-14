import type { ButtonHTMLAttributes } from 'react';

export function Button({
  variant = 'default',
  size = 'normal',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary'; size?: 'normal' | 'small' }) {
  const cls = ['button', variant === 'primary' ? 'button--primary' : '', size === 'small' ? 'button--small' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={cls} {...rest} />;
}
