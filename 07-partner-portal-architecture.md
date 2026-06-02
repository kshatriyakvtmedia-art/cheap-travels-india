# Partner Portal — Architecture & Plan

A separate dashboard where operator agents (Laxmi, Ram Dalal, future partners) log in to **see only their own inventory's bookings**, payout statements, and settlement reports. Designed so each partner can be onboarded in a day, with zero risk of seeing each other's data.

---

## TL;DR — what this is and isn't

| Is | Isn't |
|---|---|
| A read-only dashboard for partner operators | A booking creation tool for partners |
| Scoped to each partner's own inventory (Laxmi sees Laxmi only) | A shared admin panel (that's `/admin`) |
| Live data from the same DB | A separate database |
| Mobile-first (operators check on phone) | Desktop-only |
| Magic-link / phone-OTP login (no passwords for partners) | Username/password (they always forget) |

---

## 1. Why a separate portal at all?

Three real reasons:

1. **Trust closes the deal.** When you sign up partner #4 next month, the first question they'll ask is *"how will I see the bookings my buses are getting?"* Right now your only answer is *"I'll email you a CSV every week."* A self-serve dashboard turns that into a 30-second demo.
2. **Reduces your support load.** Today, every "kitne bookings aaye?" question from a partner is a phone call to you. After this exists, they check the dashboard themselves.
3. **It's the first step toward giving partners a payout view** — and eventually self-serve commission settings. Both are competitive advantages over RedBus's opaque agent dashboards.

---

## 2. Brain map of the partner flow

```
┌──────────────────────────────────────────────────────────────┐
│   PARTNER PORTAL  (subdomain: partners.cheaptravels.in)      │
└──────────────────────────────────────────────────────────────┘

  Partner logs in              Partner sees only their data
  ─────────────────            ─────────────────────────────
  1. Enters mobile             - Today's bookings count
  2. Receives OTP via SMS      - Today's revenue (their share)
  3. Backend verifies          - Top-5 routes by booking volume
     + issues JWT with         - Recent 20 bookings table
     scope: partner:lxmi       - Weekly settlement statement
                               - Open / pending refunds list
                               - Helpline to YOU

                  │
                  ▼
  ┌────────────────────────────────────────┐
  │   Backend filters EVERY query by       │
  │   the JWT's partner scope.             │
  │   Laxmi token never sees RDLH rows.    │
  └────────────────────────────────────────┘
                  │
                  ▼
  ┌────────────────────────────────────────┐
  │   Postgres (Neon)                      │
  │   bookings.partner_id = 'lxmi'         │  ← already exists in your schema
  │   bookings.partner_id = 'rdlh'         │
  │   bookings.partner_id = 'ssr'          │
  └────────────────────────────────────────┘
```

The key insight: **you're not building a new system. You're adding a scoped read view on top of the data you already collect.**

---

## 3. Schema delta (Prisma)

Most of what we need already exists. Only one new table and two enums.

```prisma
// schema.prisma — add these after your existing models

enum PartnerRole {
  OWNER         // primary contact, sees finance + bookings
  OPS           // shift staff, sees bookings only
}

enum PartnerStatus {
  ACTIVE
  SUSPENDED
}

model Partner {
  id            String         @id        // matches the operator key: "lxmi", "rdlh", "ssr"
  name          String                    // "Laxmi Holidays Pvt Ltd"
  ownerPhone    String                    // primary login phone (E.164 format)
  ownerEmail    String?
  status        PartnerStatus  @default(ACTIVE)
  commissionPct Float          @default(20)  // what THEY pay you on each booking
  bankIfsc      String?
  bankAcct      String?        // store encrypted via your existing AES-256 util
  createdAt     DateTime       @default(now())

  users         PartnerUser[]
  bookings      Booking[]      @relation("PartnerBookings")  // back-ref
}

model PartnerUser {
  id        String        @id @default(cuid())
  partner   Partner       @relation(fields: [partnerId], references: [id])
  partnerId String
  phone     String        @unique           // login identity
  name      String
  role      PartnerRole   @default(OPS)
  lastLogin DateTime?
  createdAt DateTime      @default(now())

  @@index([partnerId])
}

// You already have `bookings.partner_id` (string). Just add the FK relation:
// model Booking {
//   ...existing fields...
//   partner Partner @relation("PartnerBookings", fields: [partnerId], references: [id])
// }
```

Run `npx prisma migrate dev --name add_partner_portal` after pasting this.

---

## 4. RBAC roles — who sees what

| Role | Bookings | Revenue/payouts | Refunds | Settings | Notes |
|---|---|---|---|---|---|
| **PARTNER_OWNER** | own only | ✅ own only | ✅ raise refund request | ✅ change contact, add OPS users | one per partner |
| **PARTNER_OPS** | own only | ❌ | ❌ | ❌ | unlimited per partner |
| **ADMIN** (you) | all partners | all | resolve refund | onboard partner | already exists |

Implementation: every API route checks `req.user.scope`. If scope is `partner:lxmi`, the route appends `WHERE partner_id = 'lxmi'` before returning. Cross-partner queries are rejected at middleware.

---

## 5. Login flow (phone OTP via Firebase, same as customers)

You already have Firebase Phone Auth working for customers. Reuse exactly the same flow:

```
POST /api/partner/auth/send-otp        body: { phone }
POST /api/partner/auth/verify-otp      body: { phone, otp }
  → backend looks up PartnerUser by phone
  → if found, issue JWT with payload:
    { sub: userId, partnerId, role: 'OWNER' | 'OPS', exp: 7d }
  → if not found, return 403 ("Phone not registered — please contact Cheap Travels onboarding")
```

Why this is good:
- Partners don't need to remember passwords (they will forget within a week).
- You don't need email infra for invitations (phone is the source of truth in India anyway).
- Onboarding a new partner = inserting one row in `PartnerUser`. That's it.
- JWT lasts 7 days, refresh on activity. Long enough to not annoy, short enough to revoke.

---

## 6. API surface (8 endpoints, all scoped)

| Method | Path | Returns |
|---|---|---|
| POST | `/api/partner/auth/send-otp` | `{ ok }` — sends Firebase OTP |
| POST | `/api/partner/auth/verify-otp` | `{ token, user, partner }` |
| GET  | `/api/partner/me` | `{ partner, user, role }` |
| GET  | `/api/partner/stats?from=&to=` | `{ bookings, revenue, refunds, topRoutes }` |
| GET  | `/api/partner/bookings?status=&limit=&offset=` | `{ rows, total }` |
| GET  | `/api/partner/bookings/:pnr` | one booking detail |
| GET  | `/api/partner/payouts?month=YYYY-MM` | settlement statement |
| POST | `/api/partner/refunds/:bookingId` | request a refund (OWNER only) |

All except `/auth/*` require a valid partner JWT. Scope check happens in middleware.

---

## 7. UI — pages the partner sees

1. **Login** — phone field + OTP. Branded with partner's logo if you have it on file.
2. **Dashboard** — today's bookings count, today's revenue (their gross commission), 7-day chart, top-5 routes.
3. **Bookings** — paginated table: PNR · route · date · seat · passenger · fare · status. Filter by date range + status. CSV export.
4. **Payouts** — month-by-month statement. *"April: ₹47,200 across 384 bookings — settled 5 May via NEFT to HDFC 1234"*. PDF download per month.
5. **Refunds** — list of refund requests (theirs raised + customer-raised). Status: pending / approved / rejected.
6. **Settings** — change owner phone, add OPS staff, update bank account (with re-OTP confirmation).

All pages reuse your existing teal+orange brand palette and the mascot illustrations. Mobile-first, because partners check on phone.

---

## 8. Deployment

- Same Vercel project. Add a new route folder: `public/partners/` and `api/partner-*`.
- Subdomain `partners.cheaptravels.in` — DNS CNAME to your main Vercel host, Vercel routes by hostname.
- No new infra. No new DB. No new auth provider. **Total deploy cost: zero extra rupees.**

---

## 9. Pros & cons of doing this now

**Pros**
- Closes the *"how will partners see their data?"* objection on day 1.
- Cuts your support call volume in half within a month.
- Looks professional in front of redBus when you finally get the Partner API call — they'll see you've already built operator-facing infra.
- Reuses your existing Firebase auth, your existing schema, your existing design system. About 2 days of dev.

**Cons**
- Adds a surface area you'll have to maintain (every schema change now affects partners too).
- One more thing for your dev head to argue about.
- Partners may push for *more* features once they have any (e.g., self-serve commission tuning). Be ready to politely defer.

---

## 10. What to build first (4-hour MVP)

If you have one evening tomorrow, build only this:

1. Add `Partner` + `PartnerUser` tables (5 min — `prisma migrate`).
2. Seed Laxmi + RDLH manually with your phone number as the owner (so you can test).
3. Build `/api/partner/auth/*` endpoints (reuse existing Firebase verify code — copy/paste, change scope).
4. Build `public/partners/login.html` (same as customer login, change branding).
5. Build `public/partners/dashboard.html` with **only the bookings table** (skip charts, skip payouts).
6. Send the partner the URL: *"partners.cheaptravels.in — login with the mobile number you gave us."*

That alone is enough for the dev head meeting and enough to demo to your first onboarding call. Everything else (payouts, refunds, settings) can ship in week 2.

---

## 11. Hard pushback — don't do this yet if

- Your dev head is the only one to ship it, and you have one revenue-critical feature blocking. Partner portal is high-trust-value but low-revenue-value in the first month. Ship payment gateway first if payment is broken.
- You haven't signed your first 3rd partner. With only Laxmi + RDLH, the dashboard helps you, not them. You can email both manually.
- You don't have a current account yet. Partners will ask about payouts, you'll have no answer. **Get the current account first**, then build the portal — otherwise the very first dashboard view (revenue / payouts) is a lie.

The right sequence: **current account → first 3rd partner signed → then portal**.

---

*This document is planning, not built code. The Prisma schema changes and API endpoints above are accurate but not yet executed against your repo. Tell me to ship the 4-hour MVP and I'll write the actual files.*
