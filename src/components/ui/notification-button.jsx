import React from 'react';
import { Bell } from 'lucide-react';
import { Badge } from './badge';
import { Button } from './button';
import { cn } from '../../lib/utils';

const sizeConfig = {
  sm: { padding: 'p-2', icon: 'h-4 w-4', badge: 'h-4 min-w-[1rem] text-xs' },
  md: { padding: 'p-3', icon: 'h-5 w-5', badge: 'h-5 min-w-[1.25rem] text-sm' },
  lg: { padding: 'p-4', icon: 'h-6 w-6', badge: 'h-5 min-w-[1.25rem] text-sm' },
};

const defaultBadgeStyle = {
  position: 'absolute',
  top: '-5px',
  right: '-5px',
  width: '18px',
  height: '18px',
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: '#ef4444',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '10px',
  fontWeight: '700',
};

export function NotificationButton({
  count,
  icon,
  size = 'md',
  maxCount = 9,
  className,
  badgeClassName,
  badgeStyle,
  style,
  children,
  type = 'button',
  ...props
}) {
  const sizeStyles = sizeConfig[size] || sizeConfig.md;
  const displayedCount = count > maxCount ? `${maxCount}+` : count;

  return (
    <Button
      type={type}
      variant="ghost"
      size="icon"
      className={cn(
        'relative inline-flex items-center justify-center rounded-full',
        sizeStyles.padding,
        className
      )}
      style={style}
      {...props}
    >
      {icon ?? <Bell aria-hidden="true" className={sizeStyles.icon} />}
      {children}
      {count !== undefined && count > 0 && (
        <Badge
          aria-label={`${count} notifications`}
          className={cn(sizeStyles.badge, 'p-1', badgeClassName)}
          style={{ ...defaultBadgeStyle, ...badgeStyle }}
        >
          {displayedCount}
        </Badge>
      )}
    </Button>
  );
}

export default NotificationButton;
