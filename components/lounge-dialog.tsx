'use client'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
export function LoungeDialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="lounge-dialog"
      aria-label={title}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect()
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose()
        }
      }}
    >
      <div className="dialog-header">
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X size={20} />
        </button>
      </div>
      {open && children}
    </dialog>
  )
}
