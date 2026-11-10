import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XOctagon, X } from "lucide-react";
import { cn } from "../../lib/utils";

// Pop-up alert card (success / warning / info / error), in a light
// "default" style or a solid "filled" style. Used by the staff portal's
// live notifications (src/admin/components/StaffToaster.jsx).

const alertToastVariants = cva(
  "relative w-full max-w-sm overflow-hidden rounded-lg shadow-lg flex items-start p-4 space-x-4",
  {
    variants: {
      variant: {
        success: "",
        warning: "",
        info: "",
        error: "",
      },
      styleVariant: {
        default: "bg-background text-foreground border",
        filled: "",
      },
    },
    compoundVariants: [
      { variant: "success", styleVariant: "default", className: "border-success/40" },
      { variant: "warning", styleVariant: "default", className: "border-warning/60" },
      { variant: "info", styleVariant: "default", className: "border-info/40" },
      { variant: "error", styleVariant: "default", className: "border-destructive/40" },
      { variant: "success", styleVariant: "filled", className: "bg-success text-success-foreground" },
      { variant: "warning", styleVariant: "filled", className: "bg-warning text-warning-foreground" },
      { variant: "info", styleVariant: "filled", className: "bg-info text-info-foreground" },
      { variant: "error", styleVariant: "filled", className: "bg-destructive text-destructive-foreground" },
    ],
    defaultVariants: {
      variant: "info",
      styleVariant: "default",
    },
  }
);

const iconMap = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  error: XOctagon,
};

const iconColorClasses: Record<string, Record<string, string>> = {
  default: {
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
    error: "text-destructive",
  },
  filled: {
    success: "text-success-foreground",
    warning: "text-warning-foreground",
    info: "text-info-foreground",
    error: "text-destructive-foreground",
  },
};

export interface AlertToastProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationEnd">,
    VariantProps<typeof alertToastVariants> {
  /** The title of the alert. */
  title: string;
  /** A more detailed description for the alert. */
  description: string;
  /** Called when the alert is dismissed. */
  onClose: () => void;
  /** Optional button (e.g. "Open booking"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional main button shown first (e.g. "Check in"). */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryBusy?: boolean;
}

const AlertToast = React.forwardRef<HTMLDivElement, AlertToastProps>(
  ({ className, variant = "info", styleVariant = "default", title, description, onClose, actionLabel, onAction, primaryLabel, onPrimary, primaryBusy = false, ...props }, ref) => {
    const kind = variant || "info";
    const look = styleVariant || "default";
    const Icon = iconMap[kind];

    return (
      <motion.div
        ref={ref}
        role="alert"
        layout
        initial={{ opacity: 0, y: 50, scale: 0.3 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.5 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className={cn(alertToastVariants({ variant: kind, styleVariant: look }), className)}
        {...props}
      >
        <div className="flex-shrink-0">
          <Icon className={cn("h-6 w-6", iconColorClasses[look][kind])} aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-sm opacity-90 break-words">{description}</p>
          {((primaryLabel && onPrimary) || (actionLabel && onAction)) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {primaryLabel && onPrimary && (
                <button
                  type="button"
                  onClick={onPrimary}
                  disabled={primaryBusy}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-bold shadow-sm disabled:opacity-60",
                    look === "default" ? "bg-primary text-primary-foreground" : "bg-black/80 text-white"
                  )}
                >
                  {primaryBusy ? "Working…" : primaryLabel}
                </button>
              )}
              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className={cn(
                    "text-xs font-semibold underline underline-offset-2",
                    look === "default" ? "text-primary" : "text-current"
                  )}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "p-1 rounded-full opacity-80 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2",
              look === "default" ? "text-foreground/70 hover:bg-muted" : "hover:bg-black/20"
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    );
  }
);

AlertToast.displayName = "AlertToast";

export { AlertToast, alertToastVariants };
