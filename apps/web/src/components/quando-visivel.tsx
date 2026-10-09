import { type ReactNode, useEffect, useRef, useState } from "react";

export function QuandoVisivel({ children, reserva, className }: { children: ReactNode; reserva: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    if (visivel || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visivel]);
  return (
    <div ref={ref} className={className}>
      {visivel ? children : reserva}
    </div>
  );
}
