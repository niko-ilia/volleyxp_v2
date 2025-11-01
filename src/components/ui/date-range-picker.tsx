"use client";

import * as React from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DateRangePicker({ value, onChange, placeholder = "Select a date range", className }: {
  value: DateRange | undefined;
  onChange: (v: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const display = React.useMemo(() => {
    if (value?.from && value?.to) return `${format(value.from, "MMM d, yyyy", { locale: ru })} – ${format(value.to, "MMM d, yyyy", { locale: ru })}`;
    if (value?.from) return `${format(value.from, "MMM d, yyyy", { locale: ru })}`;
    return placeholder;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-left font-normal w-full rounded-full h-10 px-4", className)}>
          {display}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto" align="end">
        <Calendar
          mode="range"
          selected={value}
          onSelect={(r) => onChange(r)}
          numberOfMonths={2}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}


