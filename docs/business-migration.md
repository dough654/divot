# Business Account Migration Checklist

Migrate all paid services and accounts from personal to Skeel Software LLC once the Mercury business bank account is active.

## Billing Migration (Move to Business Card)

| Service | What It Is | Current Account | Est. Cost |
|---------|-----------|-----------------|-----------|
| Apple Developer Program | iOS app distribution | Personal | $99/yr |
| Google Play Console | Android app distribution | Personal | $25 one-time (already paid) |
| Fly.io | Signaling + API server hosting | Personal | Usage-based |
| Cloudflare | Domain registration, R2 storage | Personal | ~$12/yr domain + usage |
| Clerk | Auth service | Personal | Free tier (paid if scaling) |
| PostHog | Analytics & feature flags | Personal | Free tier (paid if scaling) |
| RevenueCat | Subscription management | Personal | Free tier (paid if scaling) |
| Turso | Database (dev + prod) | Personal | Free tier (paid if scaling) |
| Expo/EAS | Cloud builds | Personal | Free tier (paid for priority) |
| Hover | divotgolf.app domain (transfer to Cloudflare) | Personal | ~$15/yr |

## Account Ownership Updates

| Item | Action |
|------|--------|
| App Store Connect | Update publisher/seller name to Skeel Software LLC |
| Google Play Console | Update developer account name to Skeel Software LLC |
| Expo/EAS | Update owner or create org account |
| Clerk | Update billing contact |
| Fly.io | Update billing contact |

## Legal / Compliance

| Item | Action |
|------|--------|
| Privacy Policy | Create and host at divotgolf.app/privacy |
| Terms of Service | Create and host at divotgolf.app/terms |
| Landing Page | Simple page with app description, screenshots, download links |
| Business Email | Set up contact@divotgolf.app or similar |
| Support Email | Verify feedback@divotgolf.app is routed correctly |

## Domain / Web

| Item | Action |
|------|--------|
| divotgolf.app | Transfer from Hover to Cloudflare |
| Business email | Set up via Google Workspace ($7/mo) or Zoho (free) |
| Landing page | Host on Cloudflare Pages or similar |

## Notes

- Most services are on free tiers — the billing migration is about having the business card on file, not necessarily paying more.
- Apple Developer Program is the big one — changing the seller name to the LLC requires a DUNS number. Start this early, it can take a few weeks.
- Google Play developer account name change requires identity verification with the LLC docs.
