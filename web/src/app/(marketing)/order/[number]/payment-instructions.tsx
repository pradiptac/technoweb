import Image from "next/image";
import type { PaymentInstructions } from "@/types/api";
import { formatPaise } from "@/lib/money";

/**
 * How to pay, for an order that is not paid through a gateway.
 *
 * Rendered from the order's own resource, so it is the method that order
 * actually used — the checkout never publishes account numbers to everybody who
 * reaches it, and this is where they belong instead: on a page addressed by a
 * token, to the person who placed the order.
 *
 * It disappears the moment the money arrives. Instructions for a payment
 * already made are how somebody pays twice, and the API answers null rather
 * than leaving that decision here.
 */
export function PaymentInstructionsPanel({
  instructions, orderNumber, totalPaise,
}: {
  instructions: PaymentInstructions;
  orderNumber: string;
  totalPaise: number;
}) {
  return (
    <section className="mt-4 rounded-lg border border-warn/25 bg-warn-soft p-5">
      <h2 className="text-[15px] font-semibold text-warn">{instructions.heading}</h2>
      <p className="measure mt-1 text-[13.5px]">{instructions.body}</p>

      <p className="mt-3 text-[14px]">
        Amount due{" "}
        <strong className="font-display text-[20px] tabular-nums">{formatPaise(totalPaise)}</strong>
      </p>

      {instructions.bank_details && (
        <div className="mt-3 rounded-md border border-line-strong bg-card p-3">
          {/*
            `whitespace-pre-line`, because this is typed as lines in Settings and
            an account number, an IFSC and a branch on one run-on line is
            something somebody will mis-copy.
          */}
          <p className="font-mono text-[13px] whitespace-pre-line">{instructions.bank_details}</p>
        </div>
      )}

      {(instructions.upi_id || instructions.qr_url) && (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {instructions.qr_url && (
            <div className="rounded-md border border-line-strong bg-white p-2">
              {/*
                A fixed box, so a slow image cannot move the account details
                underneath it — the rule every other image on the site follows.
                White behind it deliberately: a QR code inverted by a dark scheme
                is one a scanner reads as nothing.
              */}
              <Image
                src={instructions.qr_url}
                alt={`UPI QR code for paying ${orderNumber}`}
                width={180}
                height={180}
                className="size-[180px] object-contain"
                unoptimized
              />
            </div>
          )}

          {instructions.upi_id && (
            <div>
              <p className="text-[12.5px] text-muted">UPI ID</p>
              {/* `select-all`: this is retyped into a banking app, and a mono
                  face is what keeps 0 and O apart while it is. */}
              <p className="font-mono text-[15px] break-all select-all">{instructions.upi_id}</p>
              <p className="mt-2 text-[12.5px] text-muted">
                Paying from a desktop? Use the ID — a QR code cannot be scanned from the screen you
                are paying on.
              </p>
            </div>
          )}
        </div>
      )}

      {instructions.wants_reference && (
        <p className="measure mt-4 text-[12.5px] text-muted">
          Quote <strong className="font-mono">{orderNumber}</strong> as the reference. It is how the
          payment is matched to this order — without it, matching it is somebody reading a statement
          and guessing.
        </p>
      )}
    </section>
  );
}
