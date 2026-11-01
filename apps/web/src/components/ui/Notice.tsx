import type { HTMLAttributes } from 'react';

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'danger' | 'success';
}

export function Notice({ tone = 'info', className, ...rest }: NoticeProps) {
  const t = tone === 'info' ? '' : ` notice-${tone}`;
  return <div className={`notice${t}${className ? ` ${className}` : ''}`} {...rest} />;
}
