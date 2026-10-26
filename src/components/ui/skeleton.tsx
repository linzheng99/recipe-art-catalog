import { cn } from "cn";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

function Skeleton({ className, ...props }: HTMLMotionProps<"div">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted", className)}
      animate={{ opacity: reduced ? 1 : [1, 0.5, 1] }}
      transition={{ duration: 1.4, repeat: reduced ? 0 : Infinity }}
      {...props}
    />
  );
}

export { Skeleton };
