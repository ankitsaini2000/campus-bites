import React from "react";
import { FaPrint, FaTimes, FaFire } from "react-icons/fa";

/**
 * Order receipt.
 *
 * A clean, printable summary of any order: every
 * line, every lifecycle transition with its
 * timestamp, and — once the kitchen finishes — the
 * real time the order took.
 */
export default function ReceiptModal({ order, onClose }) {
  const readyMinutes =
    order.status === "Completed" && order.completedAt
      ? Math.max(
          1,
          Math.round(
            (new Date(order.completedAt).getTime() -
              new Date(order.date).getTime()) /
              60000
          )
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="receipt-modal"
      role="dialog"
      aria-label="Order receipt"
    >
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-sm overflow-hidden">
        {/* Brand header */}
        <div className="bg-brand-500 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/20">
              <FaFire />
            </span>
            <div>
              <p className="font-extrabold leading-tight">
                Campus Bites
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">
                University Canteen
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="opacity-80 hover:opacity-100"
          >
            <FaTimes />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex justify-between gap-3 text-xs text-ink-mute mb-4">
            <span className="break-all">Order {order._id}</span>
            <span className="shrink-0">
              {new Date(order.date).toLocaleString()}
            </span>
          </div>

          {/* Item lines */}
          <div className="space-y-1.5 mb-4">
            {(order.items || []).map((item, i) => (
              <div
                key={`${item.food}-${i}`}
                className="flex justify-between text-sm gap-3"
              >
                <span className="text-ink-soft">
                  <span className="font-bold text-ink mr-1.5">
                    {item.quantity}×
                  </span>
                  {item.name}
                </span>
                <span className="text-ink shrink-0">
                  ₹{item.price * item.quantity}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-stone-300 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span>₹{Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>
                  Discount
                  {order.promo?.code ? ` (${order.promo.code})` : ""}
                </span>
                <span>−₹{Number(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-ink text-lg pt-1">
              <span>Total</span>
              <span>₹{Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          {/* Meta */}
          <div className="mt-4 space-y-1 text-xs text-ink-mute">
            {order.pickupSlot && <p>Pickup: {order.pickupSlot}</p>}
            {order.scheduledFor && (
              <p>
                Pre-ordered for{" "}
                {new Date(order.scheduledFor).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {readyMinutes != null && (
              <p className="font-semibold text-green-700">
                Ready in {readyMinutes} min
              </p>
            )}
          </div>

          {/* Lifecycle timeline */}
          {order.statusHistory?.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-mute font-bold mb-1.5">
                Timeline
              </p>
              <ol className="space-y-1 text-xs text-ink-mute">
                {order.statusHistory.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="font-semibold text-ink-soft">
                      {h.status}
                    </span>
                    <span>
                      {new Date(h.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="px-6 pb-5">
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center justify-center"
          >
            <FaPrint className="mr-1.5" /> Print / save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
