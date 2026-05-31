# Cheap Travels India — Technical Architecture (MVP → v1)

This is the buildable spec for the portal shown in `03-mockup-cheap-travels.html`. It assumes 3–4 B2B agent logins (Laxmi Holidays + others) and the static-UPI payment flow you chose.

---

## 1. Why this design solves the trust problem

The customer's objection is **"I won't pay you directly because you're unknown."** The system answers it three ways at once:

1. **The ticket they receive carries the operator's name and is verifiable on the operator's own portal.** That's the moment trust converts — they paste the PNR on `laxmiholidays.com` (or operator's site) and see the same booking.
2. **The discount is visible** — they pay less than RedBus on the same bus, so the switch is rational, not faith-based.
3. **The refund SLA is a one-line promise** — *if ticket isn't issued in 30 min, full auto-refund*. Public, repeated on every page, baked into the QR receipt.

You don't beat RedBus on brand. You beat them on a measurable promise (cheaper + faster ticket delivery) and a smaller, sharper experience.

---

## 2. Stack recommendation

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14 (App Router)** + Tailwind | SEO for organic search ("azamgarh to delhi bus"), fast routing, easy mobile responsiveness |
| Backend | **Node.js (NestJS)** or **Python (FastAPI)** | Async-first — needed for parallel scraping/API calls to multiple provider portals |
| Provider integration | **Playwright headless** (server-side) + **provider APIs where available** | Most Indian B2B portals (LaxmiHolidays, Easybus, ETravelSmart) don't expose REST APIs to small agents — automated browser sessions with stored login cookies are the realistic route |
| Cache | **Redis** | Inventory cache (TTL 60–120 sec), session locks, soft seat-holds |
| DB | **PostgreSQL** | Orders, customers, audit log, reconciliation records |
| Payment | **Static UPI QR (MVP)** → Razorpay/PayU dynamic QR (v2) | MVP per your choice; v2 unlocks auto-confirmation via webhook |
| Notifications | **WhatsApp Business API** (via AiSensy, Wati, or Gupshup) + **AWS SES** for email | WA delivery is the headline trust feature |
| Hosting | **Vercel** (frontend) + **AWS EC2 / Hetzner** (Playwright workers) | Workers need persistent browser sessions; Vercel won't run those |
| Logging/observability | **Sentry + Grafana Loki** | Provider portals break often — you need fast detection |

---

## 3. Data model (Postgres, simplified)

```
providers          : id, name, login_url, agent_username (enc), agent_password (enc),
                     commission_pct, status, last_session_at

routes_cache       : id, provider_id, from_city, to_city, journey_date,
                     payload_jsonb, fetched_at, expires_at
                     -- payload contains list of buses with seats, fares, points

orders             : id, customer_phone, customer_email,
                     provider_id, bus_external_id, seat_no, boarding_point_id,
                     base_fare, our_margin, customer_discount, total_payable,
                     status (held|paid_pending|confirmed|refunded|failed),
                     held_until, upi_txn_ref, provider_pnr, ticket_pdf_url,
                     created_at, confirmed_at

reconciliation_log : id, order_id, source (manual|webhook), upi_utr,
                     amount, matched_at, operator
```

---

## 4. End-to-end flow (the brain map in code terms)

### 4.1 Inventory fetch
1. Customer searches *Azamgarh → Delhi, 30 May, 1 pax*.
2. Frontend calls `GET /api/buses?from=AZH&to=DEL&date=2026-05-30`.
3. Backend fans out **in parallel** to each active provider:
   - First check `routes_cache` (TTL 90s). If fresh, return.
   - Else dispatch Playwright job: load provider's logged-in session (cookies in Redis), fill search form, scrape result table.
4. Normaliser converts each provider's HTML into the canonical bus DTO:

```ts
type Bus = {
  providerId: string;
  externalId: string;            // provider's bus/trip id
  operator: string;
  busType: string;               // "AC Sleeper 2+1"
  departure: ISODateTime;
  arrival:   ISODateTime;
  duration:  minutes;
  boardingPoints: Point[];
  droppingPoints: Point[];
  seatsAvailable: number;
  netFare: number;               // what the provider charges YOU
  providerCommissionPct: number; // e.g. 20
  amenities: string[];
}
```

5. **Commission engine** runs on each row:

```ts
const grossCommission = bus.netFare * (bus.providerCommissionPct / 100);
const ourMargin       = bus.netFare * 0.15;          // 15% kept
const customerDiscount= bus.netFare * 0.05;          // 5% off, shown as discount
const displayedFare   = bus.netFare + grossCommission - customerDiscount;
const strikeFare      = bus.netFare + grossCommission; // the "MRP" for visual
```

6. **Deduplicator + best-rate picker**: if the same bus (matched by operator + departure time) appears from two providers, keep the one with the highest `ourMargin` while still showing the same `displayedFare`. Internal optimisation — invisible to customer.

7. **Live rate-compare strip**: a separate async job scrapes RedBus / AbhiBus / MMT public listings for the same route and caches their lowest fare. Shown alongside your fare to make the savings concrete. (RedBus does not need login; their pages are publicly scrapeable but anti-bot — rotate residential proxies, throttle to 1 req / 10s per route, cache aggressively.)

### 4.2 Seat selection
- Customer expands a bus card → frontend calls `GET /api/buses/:id/seats`.
- Backend re-uses or refreshes the same Playwright session, navigates to the seat layout page, parses the seat grid, returns canonical seat map.
- When customer clicks a seat, backend creates an **order in `held` state** with `held_until = now() + 8 min`. **No booking yet.**

### 4.3 Payment (MVP — static UPI)
- Order page shows static QR with VPA `cheaptravels@upi`. Order ID is the UPI **note/remark** (e.g. `SS24A4F8C`).
- After paying, customer clicks **"I have paid"** → order moves to `paid_pending`.
- Ops dashboard shows all `paid_pending` orders side-by-side with the bank/UPI inbox SMS stream. Operator matches UTR ↔ order ID, marks paid. (Practical: scrape your UPI app email receipts or bank SMS into a simple Postgres table via a small bridge — Gmail filter → Apps Script → webhook into your API.)
- **v2 upgrade**: replace with Razorpay/PayU dynamic QR. Webhook gives auto-confirmation, no human in the loop.

### 4.4 Ticket fulfilment
- The moment order flips to `confirmed`:
  1. **Booking worker** picks it up, loads the provider session, navigates to the previously-viewed seat, fills passenger details, clicks "Confirm booking", scrapes resulting PNR + downloads the operator PDF.
  2. PDF is stored in S3. Order row updated with `provider_pnr` and `ticket_pdf_url`.
  3. **Ticket renderer** produces the Cheap Travels India-branded PDF (HTML → PDF via Puppeteer) — your logo, operator logo, PNR, seat, boarding point, refund policy, helpline.
  4. **Delivery** to WhatsApp (template message with PDF link) + email (PDF attachment).
  5. **Failure handling**: if booking worker can't issue ticket within 25 min (e.g., seat sold meanwhile), order auto-flips to `refunded` and triggers your refund SOP. Customer is messaged immediately.

### 4.5 Notifications cadence
| Event | Channel | Timing |
|---|---|---|
| Order held | — | (silent) |
| Payment received | WhatsApp + Email | Within 30s of ops marking paid |
| Ticket issued | WhatsApp + Email | Within 60s of booking worker success |
| Booking reminder | WhatsApp | 2 hours before departure |
| Live tracking link | WhatsApp | At departure time |
| Post-trip review | WhatsApp | 2 hours after arrival |

---

## 5. The trust layer (what makes it visible, not just real)

1. **Operator badge on every bus card.** Customer should never feel like they're booking through a black box.
2. **Strike-through fare next to discounted fare.** ₹1,499 → ₹1,424. The savings line is the close.
3. **"Compare elsewhere" strip** at the top of results. Show RedBus / AbhiBus / MMT live prices for the exact same route. (Yes, you compete with them directly — that's the point. If you're cheaper, show it.)
4. **PNR is operator's, not yours.** Customer can verify on Laxmi's website. Add a "Verify on operator portal" link directly under the PNR on the ticket — clicks open `laxmiholidays.com/check-pnr` prefilled. This single feature kills 70% of doubt.
5. **WhatsApp number prominently in header.** Indian shoppers trust a human number more than a chatbot.
6. **Refund SLA repeated** on hero, checkout, ticket, footer. Make it boring how often they see it.

---

## 6. Anti-fraud / abuse layer

- Phone OTP before seat hold (free to send, kills bot-driven seat squatting).
- IP + device fingerprint rate-limit (max 10 holds / hour).
- Operator-side credentials rotated weekly; secrets in AWS Secrets Manager, never in repo.
- All Playwright workers run from fixed datacenter IPs that you've whitelisted with operators where possible (some smaller B2B portals do this).

---

## 7. Build sequence (8-week MVP)

| Week | Deliverable |
|---|---|
| 1 | Repo scaffold, design system from mockup, brand assets locked |
| 2 | Provider integration #1 (Laxmi Holidays) — search + seat fetch |
| 3 | Commission engine, dedup, results page wired to real provider |
| 4 | Static UPI checkout + ops reconciliation dashboard |
| 5 | Booking worker — automated ticket fetch from Laxmi |
| 6 | WhatsApp + email delivery, branded ticket PDF, refund flow |
| 7 | Providers #2 & #3 added, RedBus live-compare scraper |
| 8 | Hardening, monitoring, soft launch to 100 customers in Azamgarh |

---

## 8. Risks & how to handle them

| Risk | Likelihood | Mitigation |
|---|---|---|
| Provider portal HTML changes break scraper | High (monthly) | Per-provider unit tests run hourly; Slack alert on parse failures |
| Operator catches the agent ID being used for resale and revokes it | Medium | Stay close to provider's TOS; 3–4 provider redundancy means a single revocation doesn't kill the business |
| Customer pays but seat sold before booking worker confirms | Medium | 8-min seat hold is the tightest workable window; offer immediate alternative seat OR refund |
| Static UPI payments without webhook are slow to reconcile | High initially | Move to dynamic QR (Razorpay) in v2 — the labour cost of manual ops grows fast |
| RedBus blocks your live-compare scraper | Medium | Use cached prices, rotate user-agents, fall back to "typical" prices if scrape fails |
| Disputed bookings (customer claims didn't receive ticket) | Low-medium | All deliveries logged, WhatsApp delivery receipt stored, 24×7 helpline |
| Legal: reselling tickets without operator consent | Medium | You're operating *as* the agent (their own commission structure), not reselling — keep paper trail of agent agreements signed with each provider |

---

## 9. What to do this week

1. **Lock domain + legal entity name** for "Cheap Travels India" (cheaptravels.in or .co.in if available; register Pvt Ltd).
2. **Sign written agent agreements** with all 3–4 providers, confirming you can resell at your own price within their commission cap.
3. **Buy domain + UPI VPA** in the legal entity's name (Pvt Ltd).
4. **Get WhatsApp Business API access** via AiSensy/Wati — takes 5–7 days for Meta approval, start now.
5. **Hire one ops person** for manual reconciliation (you'll automate them out by v2 but you need them on day 1).
6. **Lock in the Azamgarh launch** — narrow city focus lets you nail experience before scaling.

---

## 10. What this prototype does NOT cover (deliberately)

- Real payment integration (mocked QR; you must integrate Razorpay/UPI before live launch).
- Real provider scraping (Chrome session not available this turn — needs revisit when you can connect a logged-in browser, then I'll map the actual Laxmi DOM and build the parser).
- Multi-passenger / family flows (single-passenger MVP).
- Loyalty / referral programs (post-launch).
- Cancellation & refund self-service UI (v1.5).
- Train/flight verticals (future verticals — header tabs are placeholders).

---

*This document and the accompanying mockup are planning artifacts. No bookings have been or will be placed via this prototype.*
