import { cn } from "@/lib/utils";
import { type ComponentPropsWithoutRef, type ElementType } from "react";

type TypoProps<T extends ElementType = "span"> = ComponentPropsWithoutRef<T> & {
  as?: T;
};

function createTypo<T extends ElementType = "span">(
  defaultTag: T,
  baseClasses: string
) {
  function Component({ as, className, ...props }: TypoProps<T>) {
    const Tag = (as || defaultTag) as ElementType;
    return <Tag className={cn(baseClasses, className)} {...props} />;
  }
  return Component;
}

export const DisplayLg = createTypo(
  "h1",
  "font-display text-display-lg font-light tracking-tight leading-[1.1]"
);

export const HeadlineLg = createTypo(
  "h2",
  "font-display text-headline-lg font-normal tracking-tight leading-[1.2]"
);

export const HeadlineMd = createTypo(
  "h3",
  "font-display text-headline-md font-normal leading-[1.3]"
);

export const BodyLg = createTypo(
  "p",
  "font-body text-body-lg leading-[1.6]"
);

export const BodyMd = createTypo(
  "p",
  "font-body text-body-md leading-[1.6]"
);

export const LabelLg = createTypo(
  "span",
  "font-label text-label-lg font-medium tracking-wide"
);

export const LabelMd = createTypo(
  "span",
  "font-label text-label-md font-medium tracking-wide"
);

export const LabelSm = createTypo(
  "span",
  "font-label text-label-sm font-medium tracking-wide uppercase"
);
