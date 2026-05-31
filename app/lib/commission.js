// Commission engine — applies the 20% / 15% / 5% split per your business rules.
// All percentages come from env so you can tune without code changes.
const providerPct = Number(process.env.PROVIDER_COMMISSION_PCT || 20);
const marginPct   = Number(process.env.OUR_MARGIN_PCT          || 15);
const discountPct = Number(process.env.CUSTOMER_DISCOUNT_PCT   ||  5);

/**
 * Given a provider's "net fare" (what they bill us) compute what to show to the customer.
 * @param {number} netFare - provider's wholesale rate per seat
 * @returns {{strikeFare:number, displayedFare:number, ourMargin:number, customerDiscount:number, providerCommission:number}}
 */
export function priceForCustomer(netFare) {
  const providerCommission = round(netFare * providerPct / 100);
  const ourMargin          = round(netFare * marginPct / 100);
  const customerDiscount   = round(netFare * discountPct / 100);
  // What it would be without our discount = base + the full commission (mock "MRP")
  const strikeFare         = round(netFare + providerCommission);
  // What we charge customer = strikeFare minus their discount
  const displayedFare      = round(strikeFare - customerDiscount);
  return { strikeFare, displayedFare, ourMargin, customerDiscount, providerCommission };
}

function round(n) { return Math.round(n); }

export function commissionConfig() {
  return { providerPct, marginPct, discountPct };
}
