import React from 'react';
import { useScrollAnimation, getScrollAnimationClasses } from '@/hooks/useScrollAnimation';

interface ScrollSectionProps {
  children: React.ReactNode;
  animation?: 'fade-up' | 'fade-in' | 'slide-left' | 'slide-right' | 'scale';
  delay?: number;
  className?: string;
}

export const ScrollSection: React.FC<ScrollSectionProps> = ({
  children,
  animation = 'fade-up',
  delay = 0,
  className = '',
}) => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <div 
      ref={ref} 
      className={`${getScrollAnimationClasses(isVisible, animation)} ${className}`}
      style={{ transitionDelay: delay ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
};
