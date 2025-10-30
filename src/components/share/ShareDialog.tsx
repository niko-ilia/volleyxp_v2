"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ShareDialog({
  open,
  onOpenChange,
  text,
  title = "Share match",
  openHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  title?: string;
  openHref?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-all font-mono">
          {text}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              if (navigator?.clipboard) navigator.clipboard.writeText(text);
            }}
          >Copy</Button>
          {openHref ? (
            <Button asChild type="button" variant="secondary">
              <Link href={openHref}>Open match</Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ShareDialog;


