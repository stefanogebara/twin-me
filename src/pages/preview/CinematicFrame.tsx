// Isolated full-viewport host for the cinematic redesign prototypes.
//
// The designs live as a self-contained static bundle in /public/cinematic so
// they render exactly as designed/verified, with zero interaction with the
// app's ThemeProvider, SidebarLayout, or Tailwind design system. Hosting them
// in an <iframe> keeps that isolation guaranteed (no CSS/JS leakage either
// way). Reachable at /preview/landing, /preview/dashboard, /preview/talk.
type Props = { src: string; title: string };

export default function CinematicFrame({ src, title }: Props) {
  // Forward the route's query string (e.g. ?theme=light) into the static page
  // so themed deep links work; the in-page toggle handles everything else.
  const search = typeof window !== "undefined" ? window.location.search : "";
  return (
    <iframe
      src={src + search}
      title={title}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
    />
  );
}
