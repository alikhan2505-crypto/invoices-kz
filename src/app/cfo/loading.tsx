import ContentLoading from '@/components/ContentLoading'

// Segment-level loader: replaces the root full-screen splash (app/loading.tsx)
// while this section's page loads, so the section's own menu/frame stays on screen.
export default function Loading() {
  return <ContentLoading />
}
