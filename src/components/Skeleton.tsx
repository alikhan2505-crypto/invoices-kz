// --nav-border (not bg-gray-200): the dark override for gray-200 sits under
// [data-theme="dark"], which an OS-dark user without a manual choice never gets.
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'var(--nav-border)' }} />
}
