import React, { forwardRef, type ElementType, type HTMLAttributes } from "react";

interface SharedLayoutBgProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  inset?: number;
  pillClassName?: string;
  pillContainerClassName?: string;
}

export const SharedLayoutBg = forwardRef<HTMLElement, SharedLayoutBgProps>(
  function SharedLayoutBg(
    { as: Component = "div", inset: _inset, pillClassName: _pillClassName, pillContainerClassName: _pillContainerClassName, ...props },
    ref,
  ) {
    return React.createElement(Component, { ...props, ref });
  },
);
