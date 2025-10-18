"use client";

import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DatePickerProps = {
  value: Date | null;
  onChange: (d: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  locale?: Locale;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  contentClassName?: string;
};

export function DatePicker({ value, onChange, placeholder = "Выберите дату", disabled, className, locale = ru, side = "bottom", align = "start", sideOffset = 6, contentClassName }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("justify-start text-left font-normal w-full", !value && "text-muted-foreground", className)}
          disabled={disabled}
        >
          {value ? format(value, "dd.MM.yyyy", { locale }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-auto", contentClassName)} align={align} side={side} sideOffset={sideOffset}>
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => { onChange(d ?? null); setOpen(false); }}
          initialFocus
          locale={locale}
        />
      </PopoverContent>
    </Popover>
  );
}


