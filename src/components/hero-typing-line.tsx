import { useEffect, useState } from "react";

/**
 * Restrained typewriter accent used across public heroes.
 * The original full phrases are accessible once through the aria-label;
 * individual keystrokes aren't announced to screen readers.
 */
export function HeroTypingLine({
  phrases, className = "", label = "What we do", initialFullPhrase = false,
}: {
  phrases: readonly string[];
  className?: string;
  label?: string;
  initialFullPhrase?: boolean;
}) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [length, setLength] = useState(initialFullPhrase ? (phrases[0]?.length ?? 0) : 0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion || !phrases.length) return;
    const phrase = phrases[phraseIndex % phrases.length];
    const complete = length >= phrase.length;
    const empty = length === 0;
    const delay = deleting ? (empty ? 250 : 38) : (complete ? 2000 : 70);

    const timer = window.setTimeout(() => {
      if (deleting && empty) {
        setDeleting(false);
        setPhraseIndex(i => (i + 1) % phrases.length);
      } else if (!deleting && complete) {
        setDeleting(true);
      } else {
        setLength(n => n + (deleting ? -1 : 1));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, phrases, phraseIndex, length, deleting]);

  const phrase = phrases[phraseIndex % phrases.length] || "";
  return (
    <div className={className} aria-label={label + ": " + phrases.join("; ")}>
      <span aria-hidden="true" className="inline-flex max-w-full items-baseline gap-1">
        <span className="min-w-0">
          {reducedMotion ? phrases[0] : phrase.slice(0, length)}
        </span>
        {!reducedMotion && (
          <span
            className="af-typing-caret inline-block h-[1.05em] w-[2px] shrink-0 translate-y-[.13em] bg-current"
          />
        )}
      </span>
      <style>{`
        @keyframes af-type-caret { 0%, 45% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .af-typing-caret { animation: af-type-caret 1s steps(1, end) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .af-typing-caret { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
