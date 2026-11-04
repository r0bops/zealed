import Link from "next/link";
import "./landing.css";

// Turbopack rewrites *.module.css into global CSS, so class names are applied directly.
const styles = new Proxy({} as Record<string, string>, {
  get: (_target, prop) => (typeof prop === "string" ? `zl-${prop}` : ""),
});

const MISSION_TX = "1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca";
const FIRST_TX = "1bb9548ea9ee04da491071e86f7287391aa52f3260c51ce6219324615768defd";
const GITHUB = "https://github.com/r0bops/zealed";
const EXPLORER = "https://testnet.zcashexplorer.app";

function Logo({ className }: { className: string }) {
  // SVGs stay as <img>: the image optimizer rejects them unless dangerouslyAllowSVG is enabled.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src="/logo.svg" alt="Zealed" />;
}

export function SealedLanding() {
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <nav className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navInner}`}>
          <Link href="/" aria-label="Zealed home"><Logo className={styles.logo} /></Link>
          <div className={styles.links}>
            <a href="#how">Missions</a>
            <a href="#how">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="#evidence">Evidence</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <span className={styles.pill}>● Testnet</span>
          <Link className={`${styles.btn} ${styles.light}`} href="/campaigns">Launch app →</Link>
        </div>
      </nav>

      <main id="main">
        <header className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroInner}`}>
            <div>
              <div className={styles.eyebrow}><span className={styles.ok}>●</span> Shielded on Zcash testnet</div>
              <h1>Finish the mission.<span>Only you open the reward.</span></h1>
              <p className={styles.heroLead}>An agent picks a perk that works for you. The sponsor authorises it with a shielded payment, and it&apos;s sealed to your browser.</p>
              <div className={styles.ctas}>
                <Link className={`${styles.btn} ${styles.goldBtn}`} href="/claim">Claim a reward →</Link>
                <Link className={styles.btn} href="/chat">Try the agent →</Link>
              </div>
            </div>
            <div className={styles.chest}>
              <div className={styles.chestFloat}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/sealed-chest-v2.svg" alt="Sealed chest" />
              </div>
            </div>
          </div>
        </header>

        <div className={styles.marquee}>
          <div className={styles.track}>
            <BuiltWith />
            <BuiltWith duplicate />
          </div>
        </div>

        <section className={styles.section} id="how" aria-labelledby="how-title">
          <div className={styles.wrap}>
            <div className={styles.head}><span className={styles.num}>01</span><h2 id="how-title">How it works</h2></div>
            <div className={styles.grid3}>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Step 1</div>
                <h3>Complete the mission</h3>
                <p>Pass the sponsor&apos;s quiz or task. Your browser makes a key that only it holds.</p>
                <div className={styles.art}><span className={styles.muted}>quiz</span> → <span className={styles.ok}>passed</span></div>
              </article>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Step 2</div>
                <h3>The sponsor authorises it</h3>
                <p>An agent picks a perk within budget. A shielded ZEC payment authorises the order.</p>
                <div className={styles.art}><span className={styles.muted}>memo</span> → order tag + cart hash</div>
              </article>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Step 3</div>
                <h3>Open it in your browser</h3>
                <p>The code arrives encrypted to your key and is decrypted locally.</p>
                <div className={styles.art}><span className={styles.ok}>sealed</span> → <span className={styles.gold}>····-····</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="who-title">
          <div className={styles.wrap}>
            <div className={styles.head}><span className={styles.num}>02</span><h2 id="who-title">Who it&apos;s for</h2></div>
            <div className={styles.grid3}>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Organizers</div>
                <h3>Reward your community without a spreadsheet of codes</h3>
                <p>Set a mission and a budget. See counts, status and spend.</p>
              </article>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Players</div>
                <h3>No name, no email</h3>
                <p>Your perk is sealed to your browser. Copying your link doesn&apos;t copy your reward.</p>
              </article>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Builders</div>
                <h3>Reusable receipt adapter</h3>
                <p>Cart-hash memo and sealed delivery you can fork. <a className={styles.gold} href={GITHUB} target="_blank" rel="noreferrer">GitHub →</a></p>
              </article>
            </div>
            <div className={`${styles.grid3} ${styles.stack}`}>
              <article className={`${styles.card} ${styles.soonCard}`}>
                <h3>Proof of attendance via Reclaim<span className={styles.soon}>Coming soon</span></h3>
                <p>zkTLS proof that you attended a Luma event.</p>
              </article>
              <article className={`${styles.card} ${styles.soonCard}`}>
                <h3>FROST 2-of-3 treasury<span className={styles.soon}>Coming soon</span></h3>
                <p>Sponsor funds held under threshold signatures.</p>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="replay-title">
          <div className={styles.wrap}>
            <div className={styles.head}><span className={styles.num}>03</span><h2 id="replay-title">A copied link opens nothing</h2></div>
            <div className={styles.term}>
              <div className={styles.bar}>
                <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
                <span className={styles.eyebrow}>illustrative replay</span>
              </div>
              <pre>
                <span className={styles.muted}>$</span> zealed claim --invite mission-42{"\n"}
                <span className={styles.muted}>you     </span> key generated in browser · <span className={styles.ok}>bound</span>{"\n"}
                <span className={styles.muted}>copier  </span> resends the same invite link…{"\n"}
                <span className={styles.bad}>REJECTED</span> claim bound to another key · already used{"\n"}
                <span className={styles.ok}>VERIFIED</span> reward sealed to you · <span className={styles.gold}>····-····</span>
              </pre>
            </div>
            <p className={`${styles.eyebrow} ${styles.replayNote}`}>Illustrative replay — not a recorded run.</p>
          </div>
        </section>

        <section className={styles.section} id="privacy" aria-labelledby="privacy-title">
          <div className={styles.wrap}>
            <div className={styles.head}><span className={styles.num}>04</span><h2 id="privacy-title">What each side sees</h2></div>
            <div className={styles.grid3}>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Organizer / sponsor</div>
                <h3>Counts, status, amounts</h3>
                <p>Aggregate claims and spend. Never your key or your code.</p>
                <div className={styles.art}>claims: n · status · ZEC spent</div>
              </article>
              <article className={styles.card}>
                <div className={styles.eyebrow}>Zealed server</div>
                <h3>Metadata + ciphertext</h3>
                <p>Holds a viewing key only; stores the sealed blob it can&apos;t open.</p>
                <div className={styles.art}><span className={styles.ok}>sealed</span> blob · viewing key</div>
              </article>
              <article className={styles.card}>
                <div className={styles.eyebrow}>You</div>
                <h3>The code</h3>
                <p>Decrypted locally in your browser with a key that never leaves it.</p>
                <div className={styles.art}>decrypt → <span className={styles.gold}>XXXX-XXXX</span></div>
              </article>
            </div>
            <div className={styles.caveat}><b>Honest caveat:</b> a privileged server operator or Bitrefill can still see the plaintext code at issuance.</div>
          </div>
        </section>

        <section className={styles.section} id="evidence" aria-labelledby="evidence-title">
          <div className={styles.wrap}>
            <div className={styles.head}><span className={styles.num}>05</span><h2 id="evidence-title">Evidence</h2></div>
            <p className={styles.lead}>One end-to-end run on Zcash testnet, 4 Nov 2026. Nothing else is claimed.</p>
            <div className={styles.stats}>
              <div className={styles.stat}><b>~71 s</b><span>end to end</span></div>
              <div className={styles.stat}><b>$3.89</b><span>of a $5 budget</span></div>
              <div className={styles.stat}><b className={styles.height}>4581978</b><span>block height</span></div>
              <div className={styles.stat}><b className={styles.ok}>shielded</b><span>0 transparent in / out</span></div>
            </div>
            <div className={styles.card}>
              <div className={`${styles.row} ${styles.rowFirst}`}>
                <span className={styles.eyebrow}>Mission tx</span>
                <a className={`${styles.value} ${styles.gold}`} href={`${EXPLORER}/transactions/${MISSION_TX}`}>{MISSION_TX} ↗</a>
              </div>
              <div className={styles.row}>
                <span className={styles.eyebrow}>Agent pick</span>
                <span className={styles.value}>Claude Haiku → India eSIM · 1 GB / 7 days · $3.89 (budget $5)</span>
              </div>
              <div className={styles.row}>
                <span className={styles.eyebrow}>Bitrefill invoice</span>
                <span className={styles.value}>7d8e4569-daa5-4de9-9a35-518b7d42c47f <span className={styles.soon}>Bitrefill test product</span></span>
              </div>
              <div className={styles.row}>
                <span className={styles.eyebrow}>First checkout tx</span>
                <a className={`${styles.value} ${styles.gold}`} href={`${EXPLORER}/transactions/${FIRST_TX}`}>{FIRST_TX} ↗</a>
              </div>
              <div className={styles.row}>
                <span className={styles.eyebrow}>Height</span>
                <span className={styles.value}>4581712</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.final}>
          <div className={styles.wrap}>
            <div className={styles.eyebrow}>Testnet · open source</div>
            <h2>The next reward is sealed for you.</h2>
            <div className={`${styles.ctas} ${styles.center}`}>
              <Link className={`${styles.btn} ${styles.goldBtn}`} href="/claim">Claim a reward →</Link>
              <Link className={styles.btn} href="/chat">Try the agent →</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.cols}>
            <div>
              <Link href="/" aria-label="Zealed home"><Logo className={styles.footerLogo} /></Link>
              <p className={styles.blurb}>Private mission rewards, sealed to your browser.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li>Missions</li>
                <li>Agent</li>
                <li>Privacy</li>
              </ul>
            </div>
            <div>
              <h4>Developers</h4>
              <ul>
                <li><a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a></li>
                <li>Receipt adapter</li>
              </ul>
            </div>
            <div>
              <h4>Zcash</h4>
              <ul>
                <li><a href={EXPLORER} target="_blank" rel="noreferrer">Testnet explorer</a></li>
                <li>Noir Wallet</li>
              </ul>
            </div>
            <div>
              <h4>Hack</h4>
              <ul>
                <li>Built for Zcash Free Society Hack 2026</li>
              </ul>
            </div>
          </div>
          <div className={styles.legal}>
            <span>Zcash Free Society Hack · testnet only</span>
            <span>No real funds. Testnet ZEC (TAZ).</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BuiltWith({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className={duplicate ? `${styles.set} ${styles.duplicate}` : styles.set} aria-hidden={duplicate || undefined}>
      <span><b>Built with</b>Zcash</span>
      <span>Bitrefill</span>
      <span>Noir Wallet</span>
      <span>zkool</span>
      <span>libsodium</span>
      <span>Claude Haiku</span>
    </div>
  );
}
