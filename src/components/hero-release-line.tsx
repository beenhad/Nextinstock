"use client";

import { useState } from "react";
import { Check, Plus, RefreshCw } from "lucide-react";
import styles from "./hero-release-line.module.css";

type DotColor = "amber" | "green" | "red";

const currentPhoto = "/demos/pokemon-xd-current.webp";
const nextPhoto = "/demos/pokemon-xd-next.webp";
const copies = [
  { number: 1, x: 17.9, image: nextPhoto, price: "$89.99" },
  { number: 2, x: 30.6, image: currentPhoto, price: "$94.99" },
  { number: 3, x: 45.5, image: nextPhoto, price: "$109.99" },
] as const;

const dotCycle: DotColor[] = ["amber", "green", "red"];

export function HeroReleaseLine() {
  const [selected, setSelected] = useState<string | null>(null);
  const [dotColors, setDotColors] = useState<DotColor[]>(["amber", "amber", "green"]);
  const [watching, setWatching] = useState(true);
  const [sortActive, setSortActive] = useState(false);
  const [delayActive, setDelayActive] = useState(false);
  const [askActive, setAskActive] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  function toggleSelected(id: string) {
    setSelected((current) => current === id ? null : id);
  }

  function cycleDot(index: number) {
    setDotColors((current) => current.map((color, position) => position === index
      ? dotCycle[(dotCycle.indexOf(color) + 1) % dotCycle.length]
      : color));
  }

  return <div className={`hero-shot ${styles.frame}`} role="group" aria-label="Interactive release line illustration; changes here are only visual">
    <header className={styles.header}>
      <button type="button" className={`${styles.headerPhoto} ${selected === "live" ? styles.headerPhotoSelected : ""}`} onClick={() => toggleSelected("live")} aria-label="Highlight the copy on eBay" aria-pressed={selected === "live"}>
        <img src={currentPhoto} alt="" draggable={false} />
      </button>
      <div className={styles.heading}>
        <strong>Pokémon XD: Gale of Darkness</strong>
        <span><b>$84.99</b> on eBay <i /> 1 available <i /> 8 sold</span>
      </div>
      <button type="button" className={`${styles.watching} ${watching ? "" : styles.paused}`} onClick={() => setWatching((value) => !value)} aria-pressed={watching} aria-label={watching ? "Pause preview status" : "Resume preview status"}>
        <span className={styles.statusDot} key={`${watching}-${refreshCount}`} />
        {watching ? "Watching for a sale" : "Paused in preview"}
      </button>
      <button type="button" className={styles.refresh} onClick={() => setRefreshCount((value) => value + 1)} aria-label="Replay status refresh animation">
        <RefreshCw key={refreshCount} aria-hidden="true" />
      </button>
    </header>

    <section className={styles.canvas} aria-label="Six example copies in the release line">
      <div className={styles.canvasHeading}><h2>Release line</h2><p>6 copies lined up. That covers the next 6 sales.</p></div>
      <button type="button" className={`${styles.sort} ${sortActive ? styles.sortActive : ""}`} onClick={() => setSortActive((value) => !value)} aria-pressed={sortActive}>{sortActive && <Check aria-hidden="true" />} Sort worst to best</button>

      <span className={`${styles.connector} ${styles.connectorOne}`} aria-hidden="true" />
      <span className={`${styles.connector} ${styles.connectorTwo}`} aria-hidden="true" />
      <span className={`${styles.connector} ${styles.connectorThree}`} aria-hidden="true" />
      <span className={`${styles.connector} ${styles.connectorFour}`} aria-hidden="true" />
      <span className={`${styles.connector} ${styles.connectorFive} ${styles.dashed}`} aria-hidden="true" />

      <div className={`${styles.node} ${styles.liveNode}`}>
        <button type="button" className={`${styles.tile} ${styles.liveTile} ${selected === "live" ? styles.selected : ""}`} onClick={() => toggleSelected("live")} aria-label="Highlight the copy on eBay" aria-pressed={selected === "live"}>
          <img src={currentPhoto} alt="" draggable={false} />
          <span className={styles.liveFlag}>On eBay now</span>
        </button>
        <strong className={`${styles.price} ${styles.livePrice}`}>$84.99</strong>
      </div>

      {copies.map((copy, index) => <div className={styles.node} style={{ left: `${copy.x}cqw` }} key={copy.number}>
        <button type="button" className={`${styles.tile} ${selected === String(copy.number) ? styles.selected : ""} ${sortActive ? styles.sortedTile : ""}`} onClick={() => toggleSelected(String(copy.number))} aria-label={`Highlight next copy ${copy.number}`} aria-pressed={selected === String(copy.number)}>
          <img src={copy.image} alt="" draggable={false} />
          <span className={styles.number}>{copy.number}</span>
        </button>
        <button type="button" className={`${styles.copyDot} ${styles[dotColors[index]]}`} onClick={() => cycleDot(index)} aria-label={`Change copy ${copy.number} dot color`} title="Change dot color" />
        <strong className={styles.price}>{copy.price}</strong>
      </div>)}

      <button type="button" className={`${styles.timing} ${styles.delay} ${delayActive ? styles.timingActive : ""}`} onClick={() => setDelayActive((value) => !value)} aria-pressed={delayActive}>2 days</button>
      <button type="button" className={`${styles.timing} ${styles.ask} ${askActive ? styles.timingActive : ""}`} onClick={() => setAskActive((value) => !value)} aria-pressed={askActive}>ask</button>

      <div className={`${styles.node} ${styles.stackNode}`}>
        <button type="button" className={`${styles.tile} ${styles.stackTile} ${selected === "stack" ? styles.selected : ""}`} onClick={() => toggleSelected("stack")} aria-label="Highlight copies four through six" aria-pressed={selected === "stack"}>
          <img src={currentPhoto} alt="" draggable={false} />
          <span className={styles.stackNumber}>#4–6</span>
          <span className={styles.stackCount}>×3</span>
        </button>
        <strong className={styles.price}>$109.99–115.99</strong>
      </div>

      <div className={`${styles.node} ${styles.addNode}`}>
        <button type="button" className={`${styles.tile} ${styles.addTile} ${selected === "add" ? styles.selected : ""}`} onClick={() => toggleSelected("add")} aria-label="Highlight add-copy tile" aria-pressed={selected === "add"}><Plus aria-hidden="true" /></button>
      </div>
    </section>
  </div>;
}
