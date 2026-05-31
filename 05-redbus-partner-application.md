# redBus Partner API — Application Package

This file gives you everything you need to apply for official **redBus / SeatSeller Partner API** access. Once approved, you get a stable JSON/XML API for SeatSeller inventory — no scraping, no Akamai breakage. Approval takes 2–6 weeks.

---

## Step 1 — Submit application

Two routes, do both in parallel:

**Route A — Web form (fastest start)**
- URL: <https://www.redbus.in/info/partner-with-us>
- Pick **"API Partnership / Agent Integration"** category if asked.
- Attach the company brief (Step 3) in the message box.

**Route B — Direct email to B2B team**
- To: `partnerships@redbus.com`
- Cc: `b2b@seatseller.travel`, `agentsupport@seatseller.travel`
- Subject: **API Partner Onboarding — Cheap Travels India Pvt Ltd (Existing SeatSeller B2B Agent · ID 8853391184)**
- Body: see Step 2.

Mentioning your existing SeatSeller B2B agent ID is the single biggest accelerator — it proves you're already transacting on their platform.

---

## Step 2 — Email body (copy-paste, edit `[ ]` bits)

```
Dear redBus Partnerships Team,

We are Cheap Travels India Pvt Ltd, an existing B2B agent on your SeatSeller
portal (Agent ID: 8853391184, login: 8853391184). We currently issue bus
tickets through the SeatSeller web interface and are seeing growing demand.

We would like to apply for **API access (XML or REST)** to integrate SeatSeller
inventory directly into our consumer booking portal at cheaptravels.in. This
will let us:

 • Pass through redBus inventory to a wider customer base in North India
 • Operate at higher volume than the web UI allows
 • Provide a more reliable booking experience for our end customers

Key information:

 • Legal entity:        Cheap Travels India Pvt Ltd
 • CIN / GST:           [INSERT YOUR CIN AND GST NUMBER]
 • Registered office:   [INSERT ADDRESS]
 • SeatSeller Agent ID: 8853391184
 • Existing portals:    Also integrated with Laxmi Holidays and Ram Dalal
                        Holidays B2B portals
 • Consumer site:       https://cheaptravels.in (live)
 • Expected monthly volume (first 6 months):  [e.g., 500–2,000 tickets]
 • Primary route corridors:                   [e.g., UP <-> Delhi NCR, Bihar
                                              <-> Delhi, Varanasi pilgrim
                                              routes]
 • Tech stack:          Node.js / Express on Vercel + small VPS for long-
                        running tasks
 • Payment flow:        UPI direct-to-account, weekly reconciliation
 • Point of contact:    [YOUR NAME], [DESIGNATION]
                        Mobile: [+91 XXXXX XXXXX]   Email: cheaptravels.in@gmail.com

We have attached:
 • Company brief (1 page)
 • PAN card of the company
 • GST registration certificate
 • Cancelled cheque (current account)
 • Proof of business address (utility bill / lease deed)

Please let us know:
 1. The onboarding process timeline
 2. API documentation access (sandbox first, then production)
 3. Commercials — convenience fee structure, payment terms, security deposit if any
 4. Any compliance forms we need to sign

We look forward to a long-term partnership. Happy to jump on a call at any
time convenient for your team.

Best regards,

[YOUR NAME]
Founder / Director
Cheap Travels India Pvt Ltd
[PHONE]   cheaptravels.in@gmail.com
```

---

## Step 3 — Company brief (attach as a single PDF page)

Convert this into a clean one-pager (Word → Save as PDF works):

> **CHEAP TRAVELS INDIA Pvt Ltd**
> Affordable bus booking for everyone, with trust built in.
>
> **Who we are**
> A 2026-founded Indian travel-tech company focused on the underserved Tier-2/3
> bus-booking market in North India. We make legitimate operator inventory
> cheaper and more trustworthy for the price-sensitive Indian traveller.
>
> **What we do**
> Aggregate real bus inventory from verified operator B2B portals (currently
> Laxmi Holidays + Ram Dalal Holidays), apply a transparent commission model
> that gives our customers a 5% discount on the same operator's bus, and push
> a branded e-ticket to the customer's WhatsApp within 90 seconds of payment.
>
> **Differentiators**
> • UPI-direct payments — no card processing fees, faster to customer
> • Hindi-mix interface for North-India audiences
> • WhatsApp-first ticket delivery
> • Auto-refund SLA: 30 minutes
>
> **Current scale**
> • Live site: cheaptravels.in
> • Two operator partners integrated; SeatSeller will be the third
> • Existing SeatSeller B2B agent since [DATE], Agent ID 8853391184
> • Projected first-year volume: [INSERT NUMBER] tickets
>
> **Founders / Team**
> [YOUR NAME] — Founder & Director. [Background, prior travel/agent experience.]
> [CO-FOUNDER NAME if any]
>
> **Contact**
> [PHONE]  ·  cheaptravels.in@gmail.com  ·  cheaptravels.in
> Registered office: [ADDRESS]
> CIN: [INSERT]   GST: [INSERT]

---

## Step 4 — Documents to scan and keep ready

| Document | Why they ask |
|---|---|
| **PAN card of the company** | KYC of the legal entity |
| **GST registration certificate** | Tax compliance, mandatory for B2B partnership |
| **Cancelled cheque** of current account | For commission settlement |
| **Proof of business address** | Lease deed, electricity bill, or telephone bill not older than 3 months |
| **Aadhaar + PAN of director(s)** | KYC of signing authority |
| **Certificate of Incorporation** | Proves Pvt Ltd status |
| **Existing SeatSeller agent statement** (last 30 days) | Optional but strong — shows transaction history |

Keep all of these as one combined PDF named `CheapTravelsIndia_KYC.pdf`.

---

## Step 5 — Follow-up cadence

| Day | Action |
|---|---|
| Day 0 | Submit web form + email |
| Day 3 | If no reply, polite follow-up email cc'ing `agentsupport@seatseller.travel` |
| Day 7 | Call SeatSeller agent support: **+91 80 6727 0000** (mention your Agent ID 8853391184) |
| Day 14 | Escalate via LinkedIn to a redBus Partnerships Manager — search "redbus partnerships india" |
| Day 21 | If still nothing, route through your bank/CA — they often have a redBus B2B contact |

---

## What to expect after approval

- Sandbox API access first — test with dummy bookings.
- Production keys after first 5–10 successful sandbox bookings.
- Documentation will be either redBus XML API (older, more agents on it) or REST (newer, growing).
- Same commercials as your existing SeatSeller account, just routed through API.
- Typical settlement: T+2 to T+5 working days into the current account.

---

## Until the API is approved — interim plan

You are running the SeatSeller worker (see `seatseller-worker/`) on a small VPS. That handles SeatSeller inventory through the web portal with Playwright stealth. It's brittle but works today. When the official API is approved, swap the worker's internals from scraping to API calls — the rest of your codebase (api/index.js, frontend) needs zero changes because the interface stays the same.
