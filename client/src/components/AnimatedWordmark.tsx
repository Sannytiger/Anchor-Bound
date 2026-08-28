/**
 * Post-Print Protocol wordmark. The full stop travels by measured DOM coordinates,
 * landing above every rendered glyph and triggering only that glyph's post-bounce dance.
 */
import { useEffect, useRef } from "react";
import type { MouseEvent, RefObject } from "react";

const letters = "Anchor Bound".split("");
const letterIndexes = letters.map((letter, index) => letter === " " ? -1 : index).filter((index) => index >= 0);
const sequenceDuration = 5800;
const openingOffset = 0.035;
const finalReturnOffset = 0.96;

type AnimatedWordmarkProps = {
  elementRef: RefObject<HTMLDivElement | null>;
  sequence: number;
  onReplay: () => void;
  onRest: () => void;
};

export function AnimatedWordmark({ elementRef, sequence, onReplay, onRest }: AnimatedWordmarkProps) {
  const animations = useRef<Animation[]>([]);

  const jumpLetter = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    event.stopPropagation();
    const letter = event.currentTarget;
    const jump = letter.animate(
      [
        { transform: "translateY(0) rotate(0) scaleY(1)" },
        { transform: "translateY(0.04em) scaleY(0.9)", offset: 0.14 },
        { transform: "translateY(-0.16em) rotate(-2deg) scaleY(1.07)", offset: 0.46 },
        { transform: "translateY(0.022em) rotate(1.15deg) scaleY(0.99)", offset: 0.76 },
        { transform: "translateY(0) rotate(0) scaleY(1)" },
      ],
      { duration: 480, easing: "cubic-bezier(.18,.9,.25,1.08)", fill: "none" },
    );
    animations.current.push(jump);
    jump.onfinish = () => { jump.cancel(); animations.current = animations.current.filter((animation) => animation !== jump); };
  };

  useEffect(() => {
    const wordmark = elementRef.current;
    if (!wordmark) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onRest(); return; }

    const dot = wordmark.querySelector<HTMLElement>(".imprint-marker i");
    const targetLetters = letterIndexes
      .map((index) => wordmark.querySelector<HTMLElement>(`[data-letter-index="${index}"]`))
      .filter((letter): letter is HTMLElement => Boolean(letter));
    if (!dot || targetLetters.length !== letterIndexes.length) return;

    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    dot.style.transform = "translate3d(0, 0, 0)";

    const dotRect = dot.getBoundingClientRect();
    const targetPoints = targetLetters.map((letter, index) => {
      const rect = letter.getBoundingClientRect();
      const landY = rect.top - dotRect.top - dotRect.height * 0.82;
      return {
        x: rect.left + rect.width / 2 - (dotRect.left + dotRect.width / 2),
        landY,
        apexY: landY - Math.max(dotRect.height * (4.1 - index * 0.16), 32),
        reboundY: landY - Math.max(dotRect.height * (1.7 - index * 0.045), 14),
      };
    });

    const bounceStride = (finalReturnOffset - openingOffset) / targetPoints.length;
    const fullStopFrames: Keyframe[] = [{ transform: "translate3d(0, 0, 0)", opacity: 1, offset: 0 }];

    const translate = (x: number, y: number, scaleX = 1, scaleY = 1) =>
      `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`;

    targetPoints.forEach((point, index) => {
      const start = openingOffset + index * bounceStride;
      fullStopFrames.push(
        { transform: `translate3d(${point.x}px, ${point.apexY}px, 0)`, offset: start },
        { transform: translate(point.x, point.apexY + (point.landY - point.apexY) * 0.18, 1.02, 0.98), offset: start + bounceStride * 0.24 },
        { transform: translate(point.x, point.apexY + (point.landY - point.apexY) * 0.56, 1.04, 0.96), offset: start + bounceStride * 0.51 },
        { transform: translate(point.x, point.landY, 1.22, 0.74), offset: start + bounceStride * 0.68 },
        { transform: translate(point.x, point.reboundY, 0.94, 1.07), offset: start + bounceStride * 0.86 },
        { transform: translate(point.x, point.reboundY + (point.landY - point.reboundY) * 0.18, 0.98, 1.02), offset: start + bounceStride * 0.97 },
      );
    });
    fullStopFrames.push(
      { transform: "translate3d(0, 0, 0)", offset: finalReturnOffset },
      { transform: "translate3d(0, 0, 0)", offset: 1 },
    );

    const fullStopPath = dot.animate(fullStopFrames, {
      duration: sequenceDuration,
      easing: "linear",
      fill: "none",
    });
    animations.current.push(fullStopPath);

    targetLetters.forEach((letter, index) => {
      const start = openingOffset + index * bounceStride;
      const dance = letter.animate(
        [
          { transform: "translateY(0) rotate(0) scaleY(1)" },
          { transform: "translateY(0.045em) rotate(0) scaleY(0.9)", offset: 0.14 },
          { transform: "translateY(-0.115em) rotate(-2.2deg) scaleY(1.05)", offset: 0.48 },
          { transform: "translateY(0.02em) rotate(1.25deg) scaleY(0.99)", offset: 0.74 },
          { transform: "translateY(0) rotate(0) scaleY(1)" },
        ],
        {
          duration: 430,
          delay: sequenceDuration * (start + bounceStride * 0.68),
          easing: "cubic-bezier(.18,.9,.25,1.08)",
          fill: "none",
        },
      );
      animations.current.push(dance);
    });

    fullStopPath.onfinish = () => {
      fullStopPath.cancel();
      dot.style.transform = "";
      onRest();
    };
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
  }, [elementRef, sequence]);

  return (
    <div
      ref={elementRef}
      className="source-wordmark"
      role="group"
      aria-label="Anchor Bound wordmark. Select any letter for a jump animation, or select the red square to replay the full sequence."
      onClick={onReplay}
    >
      {letters.map((letter, index) => (
        letter === " " ? <span key={`space-${index}`} className="wordmark-space">&nbsp;</span> : <button
          key={`${letter}-${index}`}
          data-letter-index={index}
          className="wordmark-letter"
          type="button"
          aria-label={`Jump letter ${letter}`}
          onClick={(event) => jumpLetter(event, index)}
        >
          {letter}
        </button>
      ))}
      <button type="button" className="imprint-marker" onClick={(event) => { event.stopPropagation(); onReplay(); }} aria-label="Replay full Anchor Bound animation"><i /></button>
    </div>
  );
}
