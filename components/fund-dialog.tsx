"use client";

import { useEffect, useRef, useState } from "react";
import { Bitcoin, Check, X } from "lucide-react";

const amounts = ["0.00025", "0.001", "0.0025"];

export function FundDialog() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("0.001");
  const [connected, setConnected] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button className="button button-accent" onClick={() => setOpen(true)}>Contribute to the pool</button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="fund-dialog" role="dialog" aria-modal="true" aria-labelledby="fund-title">
            <header>
              <div><span className="overline">Fund protected reporting</span><h2 id="fund-title">Choose an amount</h2></div>
              <button ref={closeButton} className="icon-button" onClick={() => setOpen(false)} aria-label="Close contribution dialog"><X aria-hidden="true" /></button>
            </header>
            <label className="amount-field"><span>Amount in bitcoin</span><div><Bitcoin aria-hidden="true"/><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal"/><b>BTC</b></div></label>
            <div className="amount-options" aria-label="Suggested amounts">
              {amounts.map((value) => <button key={value} className={amount === value ? "selected" : ""} onClick={() => setAmount(value)}>{value} BTC</button>)}
            </div>
            <div className="network-row"><span><Bitcoin aria-hidden="true" /></span><div><strong>Bitcoin</strong><small>Lightning network</small></div><b>Fast settlement</b></div>
            <button className="button button-primary" onClick={() => setConnected(true)}>{connected ? <><Check aria-hidden="true"/>Wallet connected</> : "Connect wallet"}</button>
            <p className="dialog-footnote">You will review the destination and network fee in your wallet before contributing.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
