import { Bitcoin, CheckCircle2, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { FundDialog } from "@/components/fund-dialog";
import { payouts } from "@/lib/content";

export const metadata = { title: "Reporting fund" };

export default function FundPage() {
  return (
    <main id="main-content" className="page-shell fund-page">
      <section className="page-intro"><span className="overline">Community-owned capital</span><h1>Fund the work,<br/>not the identity.</h1><p>Your contribution joins one transparent pool. Every two weeks, one-sixth is paid to verified journalists according to qualified views and likes.</p></section>
      <div className="fund-layout">
        <section className="pool-card" aria-labelledby="pool-title">
          <header><span id="pool-title">Available reporting pool</span><Bitcoin aria-hidden="true"/></header>
          <strong>0.4278 <small>BTC</small></strong>
          <p>Protected by a public contract. The next automated payout closes in 9 days.</p>
          <div className="pool-progress"><span style={{ width: "71%" }}/></div>
          <div className="pool-label"><span>0.4278 BTC contributed</span><span>0.6000 BTC goal</span></div>
          <FundDialog />
          <div className="pool-trust"><span><ShieldCheck aria-hidden="true"/>Verifiable contract</span><span><CheckCircle2 aria-hidden="true"/>Automatic payouts</span></div>
        </section>
        <section className="formula-card" aria-labelledby="formula-title"><span className="overline">How distribution works</span><h2 id="formula-title">A simple, visible formula</h2><ol><li><b>01</b><span><strong>Engagement is qualified</strong>Repeat traffic, bots, and self-interactions are removed.</span></li><li><b>02</b><span><strong>The epoch closes</strong>Views count as 1 point and likes count as 4 points.</span></li><li><b>03</b><span><strong>The contract pays</strong>Each reporter receives their share of one-sixth of the pool.</span></li></ol><a href="#ledger">Review recent payouts</a></section>
      </div>
      <section className="ledger-section" id="ledger" aria-labelledby="ledger-title">
        <header><div><span className="overline">On-chain history</span><h2 id="ledger-title">Public payout ledger</h2><p>Amounts and aliases are visible. Legal identities stay private.</p></div><button className="secondary-button">View contract <ExternalLink aria-hidden="true"/></button></header>
        <div className="ledger-table" role="table" aria-label="Recent journalist payouts"><div className="ledger-head" role="row"><span>Journalist</span><span>Epoch share</span><span>Date</span><span>Amount</span></div>{payouts.map((payout) => <div className="ledger-item" role="row" key={payout.alias}><span><i>{payout.alias.slice(0,2).toUpperCase()}</i><strong>{payout.alias}</strong></span><span>{payout.score}</span><span>{payout.date}</span><b>{payout.amount}</b></div>)}</div>
        <aside className="notice"><Info aria-hidden="true"/><p><strong>Why aliases?</strong> Vera verifies every journalist privately. The ledger proves where funds went without exposing the person behind the work.</p></aside>
      </section>
    </main>
  );
}
