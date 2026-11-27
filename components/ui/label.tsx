"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const CONTROL =
  "input:not([type=hidden]):not([aria-hidden=true]), textarea, select, button[role=combobox]"

// shortcut: a bare <Label> sitting before its field (the pattern across ~170 call sites)
// is tied to that field after mount, so screen readers name it and a tap focuses it.
// Upgrade: pass htmlFor/id explicitly where the control is not the next one in the DOM.
function associate(label: HTMLLabelElement, id: string) {
  if (label.htmlFor || label.querySelector(CONTROL)) return
  for (let el = label.nextElementSibling; el; el = el.nextElementSibling) {
    if (el.tagName === "LABEL") return
    const control = el.matches(CONTROL) ? el : el.querySelector(CONTROL)
    if (control) {
      if (!control.id) control.id = id
      label.htmlFor = control.id
      return
    }
  }
}

function Label({ className, htmlFor, ...props }: React.ComponentProps<"label">) {
  const ref = React.useRef<HTMLLabelElement>(null)
  const id = React.useId()
  React.useEffect(() => {
    if (ref.current && !htmlFor) associate(ref.current, id)
  })
  return (
    <label
      ref={ref}
      htmlFor={htmlFor}
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
