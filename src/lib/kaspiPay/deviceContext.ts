// Per-connection device context values.
//
// The whole point of generateIdentity() being called once per connection
// (see crypto.ts) is that every invoices.kz customer looks like a distinct
// physical device to Kaspi's fraud detection. Two values in the protocol
// used to work directly against that by being hardcoded constants shared by
// every customer: the org-context call's `X-Kb-Client-Ip` and the GPS
// coordinates sent with every payment. Both are derived here instead —
// deterministically from the connection's own deviceId, so a given
// connection always reports the same values (a device that teleports
// between requests is itself a fraud signal), while different connections
// report visibly different ones.
import crypto from 'crypto'

// The original hardcoded pair, kept as the centre of the jitter box: it is a
// known-good, plausible Almaty coordinate that Kaspi already accepted.
const BASE_LATITUDE = 43.204643483375889
const BASE_LONGITUDE = 76.891962364115912

// ±0.05° ≈ ±5.5 km north/south, ≈ ±4 km east/west at this latitude. Keeps
// every derived point inside greater Almaty (roughly 43.15–43.35 N,
// 76.82–77.05 E) — a spread wide enough to look like different businesses in
// different neighbourhoods, narrow enough that no connection ever reports a
// location Kaspi would consider impossible for a Kazakhstani merchant.
const JITTER_DEGREES = 0.05

function hashFractions(deviceId: string, count: number): number[] {
  const digest = crypto.createHash('sha256').update(deviceId).digest()
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(digest.readUInt32BE(i * 4) / 0xffffffff)
  return out
}

export function deriveGeoLocation(deviceId: string): { latitude: number, longitude: number } {
  const [latFraction, lonFraction] = hashFractions(deviceId, 2)
  // Rounded to 12 decimals purely to avoid float noise in the serialized
  // payload — real GPS payloads from the app carry this many digits too.
  const round = (n: number) => Number(n.toFixed(12))
  return {
    latitude: round(BASE_LATITUDE + (latFraction - 0.5) * 2 * JITTER_DEGREES),
    longitude: round(BASE_LONGITUDE + (lonFraction - 0.5) * 2 * JITTER_DEGREES),
  }
}

// Common consumer/office LAN third octets. The real app reports the phone's
// own private LAN address here, which Kaspi cannot verify or route to — the
// only thing that matters is that it looks like a real local network and
// that it isn't identical across every customer of ours.
const LAN_SUBNETS = [0, 1, 2, 8, 10, 20, 31, 43, 50, 88, 100, 178]

export function deriveClientIp(deviceId: string): string {
  // Reads a different slice of the digest than deriveGeoLocation so the two
  // derived values are independent of each other.
  const [, , subnetFraction, hostFraction] = hashFractions(deviceId, 4)
  const subnet = LAN_SUBNETS[Math.floor(subnetFraction * LAN_SUBNETS.length) % LAN_SUBNETS.length]
  // 2–254: skips the network address, the .1 gateway and the broadcast
  // address, i.e. the range a DHCP lease actually falls in.
  const host = 2 + (Math.floor(hostFraction * 253) % 253)
  return `192.168.${subnet}.${host}`
}
