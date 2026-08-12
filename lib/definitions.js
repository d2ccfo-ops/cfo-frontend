// The glossary: what every calculated thing in this app means, and how the
// number was arrived at. Not just metric cards — chart series, table columns,
// reconciliation statuses, revenue-ladder rungs, contribution-margin layers and
// coverage percentages all live here too, because every one of them is a
// derived number that somebody has to be able to check.
//
// Every entry is transcribed from the module in cfo-backend that computes it —
// modules/calc/*.ts and routes/reconciliation.ts — not written from what the
// label sounds like. The `caveat` fields in particular are the backend's own
// honesty notes, moved to where the person reading the number can see them.
//
// Anything with NO entry here shows "no definition recorded" rather than a
// plausible-sounding paragraph. An explanation of how a number is computed is
// exactly the kind of text that is impossible to falsify by looking at it, so
// an invented one is worse than none: it would be believed.
//
// Lookup is by explicit term id first ("cm3", "status-invoiced"), then by the
// visible label, normalised. Labels carrying a spec reference ("Refund rate ·
// §66") are matched after the suffix is stripped, so a label and its key never
// have to be kept in sync by hand.

function normalise(label) {
  if (typeof label !== "string") return "";
  return label.replace(/\s*·\s*§\d+.*$/, "").trim().toLowerCase();
}

// what:     one or two sentences, in the terms a founder would use
// formula:  the arithmetic, as the calc module performs it
// sources:  which connectors have to be live for this to be real
// excludes: what is deliberately NOT in the number (optional)
// caveat:   the limitation that would otherwise be discovered too late (optional)
// spec:     the finance-engine section it implements (optional)
const DEFINITIONS = {
  // --- Overview -----------------------------------------------------------
  "available cash": {
    what: "The money actually sitting in your bank accounts right now — not what you have earned, and not what is on its way.",
    formula: "Opening balance + matched credits − matched debits, per bank account",
    sources: ["A bank account, with its opening balance set"],
    caveat:
      "Without an opening balance this cannot be computed at all, because bank transactions alone only tell you what MOVED, never what was already there. It reports as unavailable rather than showing the movement as if it were the balance.",
    spec: "§44",
  },
  "available cash today": {
    what: "The starting point of the cash forecast: bank balance as of today.",
    formula: "Opening balance + matched credits − matched debits, per bank account",
    sources: ["A bank account, with its opening balance set"],
    spec: "§44",
  },
  "net revenue": {
    what: "Revenue you are entitled to keep, after everything that reduces it. This is the top-line number every margin on the site is measured against.",
    formula: "Line-item value − discounts + shipping charged − cancellations − refunds − GST",
    sources: ["A sales channel (Shopify, Amazon, Flipkart)"],
    excludes:
      "GST is stripped at the first rung, so this is tax-exclusive throughout. It is also not cash — an order counts here the moment it is placed, whether or not the money has arrived.",
    caveat:
      "Recognised at order placement, not at delivery. For a business with heavy RTO, revenue recognised here can be materially ahead of revenue that survives.",
    spec: "§11",
  },
  "net revenue (mtd)": {
    what: "Net revenue for the current month so far, compared against the same slice of last month rather than the whole of it.",
    formula: "Line-item value − discounts + shipping charged − cancellations − refunds − GST",
    sources: ["A sales channel (Shopify, Amazon, Flipkart)"],
    excludes: "GST, cancelled orders and refunded value. Not cash — this is recognised at order placement.",
    spec: "§11",
  },
  "cash received (mtd)": {
    what: "Money that actually landed in a bank account this month. The most trustworthy number on the dashboard, because it is measured at the bank rather than inferred.",
    formula: "Sum of credit bank transactions over the period",
    sources: ["A bank account"],
    excludes:
      "Payouts a gateway says it has sent but which have not cleared, and any settlement not yet matched to a bank line.",
    spec: "§44",
  },
  "contribution margin": {
    what: "What is left of net revenue after the costs that scale with each order — product cost, fulfilment, payment fees and advertising.",
    formula: "CM0 = net revenue − product cost · CM1 = CM0 − packaging, shipping and RTO cost · CM2 = CM1 − gateway, COD and marketplace fees · CM3 = CM2 − advertising",
    sources: ["Product costs", "A sales channel", "Ad accounts", "A courier", "A payment gateway"],
    caveat:
      "Every layer reports whether it has a data source. A layer with no source contributes zero, and every margin below it is marked unreliable — because a CM3 computed with packaging, shipping and fees silently absent reads as a healthy margin while being materially wrong.",
    spec: "§36",
  },
  "contribution margin (cm3)": {
    what: "Contribution margin after all four cost layers: product cost, fulfilment, fees and advertising.",
    formula: "Net revenue − product cost − packaging/shipping/RTO − gateway/COD/marketplace fees − advertising",
    sources: ["Product costs", "A sales channel", "Ad accounts", "A courier", "A payment gateway"],
    caveat:
      "Shown as a percentage only when every layer beneath it has a real source. An unreliable 87% is far more damaging than a blank, so it reads 'Not measurable' instead.",
    spec: "§36",
  },
  "contribution profit": {
    what: "The rupee amount of contribution margin — net revenue less every cost layer that currently has data behind it.",
    formula: "Net revenue − each covered cost layer",
    sources: ["Product costs", "A sales channel"],
    caveat: "Only costed layers are subtracted. Uncovered layers are not assumed to be zero; the margin is marked unreliable instead.",
    spec: "§36",
  },
  "pending settlements": {
    what: "Money customers have already paid that has not yet reached your bank — sitting with a payment gateway or a marketplace.",
    formula: "Expected net settlement − amount actually settled, aged by how long it has been outstanding",
    sources: ["Razorpay, or a marketplace settlement feed"],
    spec: "§45",
  },
  "ad spend": {
    what: "What you actually spent on advertising over the period, across every connected ad account.",
    formula: "Sum of daily spend rows across connected ad accounts",
    sources: ["Meta Ads or Google Ads"],
    caveat:
      "Ad platforms report in each account's own billing currency. A USD-billed account is never added to an INR one — mixed currencies show a per-currency breakdown and no total, because converting would need a historical FX rate this system does not hold.",
  },
  "ad spend (mtd)": {
    what: "Advertising spend for the current month so far, across every connected ad account.",
    formula: "Sum of daily spend rows across connected ad accounts",
    sources: ["Meta Ads or Google Ads"],
    caveat: "Mixed billing currencies are never summed into one figure — see the per-currency breakdown instead.",
  },
  "rto rate": {
    what: "How much of what you ship comes back to you undelivered. In Indian D2C this is usually the single largest destroyer of margin.",
    formula: "RTO shipments ÷ shipments actually dispatched, over the period",
    sources: ["A courier (Shiprocket, Delhivery or ClickPost)"],
    excludes: "Parcels not yet picked up, cancelled shipments, and shipments whose status could not be mapped.",
    caveat:
      "Bucketed by real pickup date where the courier reports one, falling back to when the row was ingested where it does not. A period made mostly of fallback rows is measuring ingestion, not dispatch.",
  },
  "refund rate": {
    what: "The share of recognised revenue you gave back.",
    formula: "Refunded value ÷ tax-exclusive net revenue",
    sources: ["A sales channel"],
    caveat: "The denominator is recognised orders, not delivered ones — a refund can land in a later period than the order it reverses.",
    spec: "§66",
  },
  "upcoming payments": {
    what: "What you owe suppliers, and when it falls due.",
    formula: "Invoice total − payments applied − credit notes, aged by due date",
    sources: ["An accounting system (Zoho Books)"],
    excludes: "Draft and voided bills — a draft is not owed yet and a void never was.",
    spec: "§57",
  },
  "data freshness": {
    what: "How recently each connected source last completed a full sync.",
    formula: "Time since the last completed sync job, per connection",
    sources: ["At least one connection"],
    caveat:
      "This only advances when a sync JOB completes. Webhook deliveries write orders, shipments and payments without touching it, so a webhook-fed connector can be perfectly current and still read as stale. Read 'stale' as 'no full sync recently', not 'data is missing'.",
  },

  "gross sales (mtd)": {
    what: "The value of what you sold before any discounts or tax — the top of the revenue ladder, and the number Shopify's own reports call 'gross sales'.",
    formula: "Sum of line-item value, tax-exclusive, before discounts",
    sources: ["A sales channel"],
    caveat:
      "Tax-exclusive. Most Indian D2C stores price tax-inclusive, so taking the channel's raw figure would carry GST inside it — this used to read about 3% high for exactly that reason.",
    spec: "§5/§10",
  },
  "average order value": {
    what: "What a typical order is worth.",
    formula: "Gross sales ÷ order count",
    sources: ["A sales channel"],
    spec: "§64",
  },
  "orders (mtd)": {
    what: "How many orders were placed this month so far.",
    formula: "Count of orders placed over the period",
    sources: ["A sales channel"],
    excludes: "Cancelled orders, which are reported separately.",
  },
  "marketing efficiency (roas)": {
    what: "How much net revenue each rupee of advertising brought in, blended across every ad account.",
    formula: "Net revenue ÷ ad spend",
    sources: ["Meta Ads or Google Ads", "A sales channel"],
    caveat:
      "Blended, not per-campaign: it attributes ALL revenue to ads, including orders that would have happened anyway. Treat it as a trend line, not as an attribution model.",
  },
  "burn rate": {
    what: "How much cash the business consumes in a month, measured at the bank rather than inferred from revenue minus costs.",
    formula: "Bank debits − bank credits over the period, expressed monthly",
    sources: ["A bank account"],
    caveat: "Measured from real money in and out, so a month with an unusual one-off payment will show as a spike rather than being smoothed away.",
    spec: "§55",
  },
  runway: {
    what: "How long the current cash lasts at the current rate of burn.",
    formula: "Available cash ÷ monthly net burn",
    sources: ["A bank account, with its opening balance set"],
    caveat:
      "Only calculated when net burn is actually positive. A business taking in more than it spends has no runway — it has infinite runway — so this reports unavailable with a reason rather than printing a meaningless '247 months'.",
    spec: "§85",
  },

  // --- Revenue ------------------------------------------------------------
  orders: {
    what: "Orders recognised in the period.",
    formula: "Count of orders placed in the period, excluding cancellations",
    sources: ["A sales channel"],
    excludes: "Cancelled orders, which are counted and reported separately rather than quietly dropped.",
    spec: "§67",
  },
  "ordered aov": {
    what: "Average order value, measured on what was ordered rather than what was ultimately kept.",
    formula: "Net order value ÷ orders placed",
    sources: ["A sales channel"],
    spec: "§64",
  },
  "cancellation rate": {
    what: "The share of orders cancelled before they ever became revenue.",
    formula: "Cancelled orders ÷ orders placed (also reported by value)",
    sources: ["A sales channel"],
    spec: "§67",
  },

  // --- Profitability / costs ---------------------------------------------
  "product cost coverage": {
    what: "How much of what you sold has a real landed cost on file. This is a measurement of how much can be measured.",
    formula: "Order-line value with a cost ÷ total order-line value",
    sources: ["Product costs entered on the Product costs page"],
    caveat: "Contribution margin stays marked incomplete below 95%, because a margin computed with costs missing OVERSTATES profit.",
  },
  "value coverage": {
    what: "The share of order-line VALUE that has a landed cost — weighted by money, not by row count, because one bestseller matters more than fifty long-tail SKUs.",
    formula: "Order-line value with a cost ÷ total order-line value",
    sources: ["Product costs"],
    caveat: "Contribution margin stays INCOMPLETE below 95%.",
  },
  "order lines costed": {
    what: "How many individual order lines carry a product cost.",
    formula: "Count of order lines with a non-null cost",
    sources: ["Product costs"],
    caveat: "Cost is snapshot onto each line at the order's date, so changing a cost today does not rewrite history.",
    spec: "§19",
  },
  "skus missing a cost": {
    what: "SKUs you have sold that have no landed cost on file — every one of them is a hole in your margin.",
    formula: "Distinct SKUs sold in the period with no cost record",
    sources: ["Product costs"],
  },
  "loss-making skus": {
    what: "SKUs selling below what they cost you to buy, before any shipping, fees or ads are counted.",
    formula: "SKUs where net revenue − product cost is negative (CM0 < 0)",
    sources: ["Product costs", "A sales channel"],
    caveat:
      "Only fully-costed SKUs can be ranked. Shipping, fees and advertising would only make these worse, so treat this as the optimistic view.",
    spec: "§40",
  },
  "product cost (cogs)": {
    what: "What the goods you sold in this period actually cost you.",
    formula: "Sum of landed cost across costed order lines",
    sources: ["Product costs", "A sales channel"],
    caveat: "Only the costed share is counted. Uncosted lines are not assumed to be free — they are excluded, and the coverage figure tells you how much was left out.",
  },

  // --- Expenses -----------------------------------------------------------
  "vendor bills unpaid": {
    what: "Total still owed across open supplier bills.",
    formula: "Sum of invoice balances (invoice total − payments applied − credit notes)",
    sources: ["An accounting system (Zoho Books)"],
    excludes: "Draft and voided bills.",
    spec: "§57",
  },
  "due in the next 7 days": {
    what: "The part of your payables that falls due within a week.",
    formula: "Sum of open bill balances with a due date inside 7 days",
    sources: ["An accounting system (Zoho Books)"],
    spec: "§57",
  },

  // --- Reconciliation -----------------------------------------------------
  "auto-matched": {
    what: "Prepaid orders where a captured payment was found for the exact expected amount, with no human involvement.",
    formula: "Orders with a captured payment whose total equals the order total ÷ eligible prepaid orders",
    sources: ["A sales channel", "A payment gateway (Razorpay)"],
  },
  "needs review": {
    what: "Orders where a payment WAS found, but the amount does not agree with what the order says it should be.",
    formula: "Orders with a captured payment whose total differs from the order total",
    sources: ["A sales channel", "A payment gateway"],
    caveat: "A difference here is usually a partial refund, a gateway fee netted off, or a split payment — not necessarily an error.",
  },
  "no payment found": {
    what: "Checkout orders with no matching payment at all.",
    formula: "Prepaid, non-COD orders with no captured payment and no payment terms",
    sources: ["A sales channel", "A payment gateway"],
    caveat:
      "Orders raised in the Shopify admin on payment terms are deliberately NOT counted here — those are invoiced and awaiting payment, not failed. They appear under 'Awaiting invoice payment'.",
  },
  "awaiting invoice payment": {
    what: "Orders raised on payment terms — an invoice was issued and the money is owed on its due date.",
    formula: "Orders carrying payment terms, with no captured payment yet",
    sources: ["A sales channel"],
    caveat: "Owed, not failed. Counting these as reconciliation failures is what made the failure count look alarming before they were split out.",
  },
  "cod collected by courier": {
    what: "Cash your courier has collected from customers on delivery and is holding on your behalf.",
    formula: "Order value of COD orders whose shipment is marked delivered",
    sources: ["A sales channel", "A courier"],
  },
  "cod awaiting remittance": {
    what: "COD orders whose delivery status is unknown, so it cannot yet be said whether the cash has been collected.",
    formula: "COD orders with no courier record to check against",
    sources: ["A courier"],
    caveat: "This is a visibility gap, not a debt. Connecting a courier moves these into either 'collected' or 'in transit'.",
  },

  // --- Settlements --------------------------------------------------------
  "cod collected, not yet remitted": {
    what: "Cash the courier has already taken from your customers but has not paid across to you yet.",
    formula: "Order value of delivered COD orders, less anything already remitted",
    sources: ["A sales channel", "A courier"],
  },
  "cod still in transit": {
    what: "COD parcels still out for delivery — not owed to you yet, because nobody has paid for them.",
    formula: "Order value of COD orders with no delivered, RTO-initiated or RTO-delivered shipment",
    sources: ["A sales channel", "A courier"],
  },
  "rto — never collected": {
    what: "COD orders that came back undelivered. This cash will never arrive, and the shipping was paid both ways.",
    formula: "Order value of COD orders whose shipment returned to origin",
    sources: ["A sales channel", "A courier"],
  },
  "prepaid deposits already banked": {
    what: "Partly-prepaid COD orders (PPCOD) where the deposit was taken online at checkout, so that portion is not riding with the courier.",
    formula: "Prepaid portion of PPCOD orders",
    sources: ["A sales channel"],
  },

  // --- Cash flow ----------------------------------------------------------
  "inflows expected": {
    what: "Cash expected to arrive over the forecast window, from orders already placed plus orders not placed yet.",
    formula:
      "Already-earned: orders already placed, landing on their own settlement or COD remittance lag. Not-yet-earned: trailing 28-day order velocity × day-of-week shape",
    sources: ["A sales channel", "A payment gateway or courier for the lag"],
    caveat: "A forecast is the one number here that cannot be checked against a source. Every component declares whether it is measured or assumed.",
    spec: "§83/§84",
  },
  "outflows expected": {
    what: "Cash expected to leave over the forecast window.",
    formula: "Scheduled vendor bills + recurring expenses + ad spend run rate",
    sources: ["An accounting system, or an ad account"],
    caveat:
      "With none of those connected, outflow is UNKNOWN — not zero. A projection that treats unknown as zero draws a line that rises forever, which is why the forecast marks itself unreliable instead.",
    spec: "§83/§84",
  },

  // --- Inventory ----------------------------------------------------------
  "inventory value": {
    what: "What your stock on hand is worth at retail price, right now.",
    formula: "Sum of variant price × quantity on hand, across every product",
    sources: ["A sales channel (Shopify)"],
    caveat:
      "There is deliberately no prior-period comparison. Product records are overwritten on every sync — Shopify reports only CURRENT stock, never a history of it — so any 'vs last month' here would be fabricated.",
  },
  "avg. days of cover": {
    what: "How many days of selling your current stock would last at the recent rate.",
    formula: "Stock on hand ÷ daily sales velocity, value-weighted across SKUs",
    sources: ["A sales channel"],
    caveat: "Velocity is measured over a trailing sales window, so a SKU with no recent sales has no meaningful cover figure.",
  },
  "skus at risk of stockout": {
    what: "SKUs that will run out within two weeks at the current rate of sale.",
    formula: "Count of SKUs with under 14 days of cover",
    sources: ["A sales channel"],
  },
  "slow-moving stock value": {
    what: "Money tied up in stock that is not moving.",
    formula: "Value of SKUs with 90+ days of cover, or zero sales in the last 30 days",
    sources: ["A sales channel"],
  },
  // --- The revenue ladder, rung by rung (§5–§11) ---------------------------
  // These are the steps of the waterfall on the Revenue page. Each one is a
  // separate, differently-named number precisely so that "revenue" is never
  // ambiguous — §1 of the finance-engine spec exists to prevent exactly that.
  gmv: {
    title: "GMV (gross merchandise value)",
    what: "The value of the goods themselves, before anything is added or taken away. The first rung of the ladder.",
    formula: "Sum of line-item value, tax-exclusive",
    sources: ["A sales channel"],
    excludes: "Shipping charged to the customer, discounts, and GST.",
    caveat:
      "Tax-exclusive. Stores that price tax-inclusive (most Indian D2C) report a GMV with GST inside it, which is where a ~3% overstatement used to come from.",
    spec: "§5/§10",
  },
  "gross order value": {
    what: "GMV plus what you charged the customer for shipping — the full value of the order as placed.",
    formula: "GMV + shipping charged",
    sources: ["A sales channel"],
    spec: "§6",
  },
  "net order value": {
    what: "What the order is worth after discounts. Still an ORDER metric — nothing here says the order survived.",
    formula: "GMV − discounts + shipping charged",
    sources: ["A sales channel"],
    excludes: "Cancellations and refunds, which come off at the next rung.",
    spec: "§7",
  },
  discounts: {
    what: "Value given away at checkout — codes, automatic discounts and price reductions.",
    formula: "Sum of discount applied, tax-exclusive",
    sources: ["A sales channel"],
    spec: "§7/§10",
  },
  cancellations: {
    what: "Orders that were cancelled and so never became revenue. Shown as its own step rather than being filtered out, because you need to see the amount that never converted, not just its absence.",
    formula: "Net order value of cancelled orders",
    sources: ["A sales channel"],
    spec: "§67",
  },
  refunds: {
    what: "Money given back to customers on orders that were recognised.",
    formula: "Sum of refunded value, tax-exclusive",
    sources: ["A sales channel"],
    caveat: "A refund lands in the period it was ISSUED, which can be later than the period of the order it reverses.",
    spec: "§66",
  },
  // "Output GST" is the label the Revenue page's ladder uses for this rung.
  get "output gst"() {
    return DEFINITIONS.gst;
  },
  gst: {
    title: "Output GST",
    what: "The tax component, which was never yours to keep.",
    formula: "Tax charged on recognised orders",
    sources: ["A sales channel"],
    caveat: "Stripped at the first rung of the ladder, not the last — so every figure above is already tax-exclusive.",
    spec: "§10",
  },

  // --- Contribution margin layers (§36) -----------------------------------
  cm0: {
    title: "CM0 — after product cost",
    what: "Net revenue less what the goods cost you. The first and most reliable margin layer, because it needs only one input.",
    formula: "Net revenue − product COGS",
    sources: ["Product costs", "A sales channel"],
    spec: "§36",
  },
  cm1: {
    title: "CM1 — after fulfilment",
    what: "CM0 less everything it took to get the parcel there and, when it failed, back again.",
    formula: "CM0 − packaging − forward shipping − reverse shipping − RTO cost",
    sources: ["Product costs", "A courier"],
    spec: "§36",
  },
  cm2: {
    title: "CM2 — after fees",
    what: "CM1 less the cut taken by payment gateways, COD handling and marketplaces.",
    formula: "CM1 − gateway fees − COD fees − marketplace fees",
    sources: ["A payment gateway", "A marketplace settlement feed"],
    spec: "§36",
  },
  cm3: {
    title: "CM3 — after advertising",
    what: "What is actually left per order once you have paid to acquire it. This is what most founders mean by 'contribution margin'.",
    formula: "CM2 − advertising",
    sources: ["Meta Ads or Google Ads"],
    caveat:
      "Marked unreliable if ANY layer beneath it has no data source. A CM3 computed with packaging, shipping and fees silently absent reads as a healthy margin while being materially wrong — which is the single most dangerous output this product could produce.",
    spec: "§36",
  },
  "data completeness": {
    what: "How much of what this calculation needs is actually present. A score of the inputs, not of the business.",
    formula: "Weighted share of required inputs that have a live data source",
    sources: ["Whichever connectors the metric depends on"],
    caveat: "A high margin at low completeness is not a good margin — it is an unfinished one.",
    spec: "§89",
  },

  // --- Reconciliation statuses --------------------------------------------
  // Derived in cfo-backend/src/routes/reconciliation.ts, evaluated top to
  // bottom — the first matching branch wins, so the order below is the order
  // the engine applies.
  "status-matched": {
    title: "Matched",
    what: "A captured payment was found for this order and the amounts agree.",
    formula: "A reconciliation match exists, with high confidence and an amount difference within tolerance",
    sources: ["A sales channel", "A payment gateway"],
  },
  "status-review": {
    title: "Needs review",
    what: "A payment was found, but either the amount disagrees with the order or the match itself is not confident.",
    formula: "A match exists AND (amount difference exceeds tolerance OR match confidence is medium/low)",
    sources: ["A sales channel", "A payment gateway"],
    caveat: "Usually a partial refund, a fee netted off, or a split payment — a difference here is not automatically an error.",
  },
  "status-unmatched": {
    title: "No payment found",
    what: "A prepaid checkout order with no captured payment against it at all.",
    formula: "No match, not COD, and no payment terms on the order",
    sources: ["A sales channel", "A payment gateway"],
    caveat:
      "This is the last branch — a row only lands here after every other explanation has been ruled out. Orders raised on payment terms are classified as 'Awaiting invoice payment' instead, which is what dropped this count to zero.",
  },
  "status-cod-pending": {
    title: "COD pending",
    what: "A cash-on-delivery order. There is no payment to match until the courier collects and remits.",
    formula: "Order payment mode is COD",
    sources: ["A sales channel", "A courier, to see whether it was delivered"],
  },
  "status-invoiced": {
    title: "Awaiting invoice payment",
    what: "Raised in the store admin on payment terms — an invoice was issued and the money is owed on its due date.",
    formula: "Order carries payment terms, and has no captured payment yet",
    sources: ["A sales channel"],
    caveat: "Owed, not failed. Counting these as reconciliation failures is what made the failure count look alarming before they were split out.",
  },
  "status-written-off": {
    title: "Written off",
    what: "Someone reviewed this row and closed it deliberately.",
    formula: "The reconciliation match is marked resolved",
    sources: ["A human decision"],
  },
  "status-cancelled": {
    title: "Cancelled",
    what: "The order was cancelled, so there was never a payment to find.",
    formula: "Order has a cancellation timestamp and no match",
    sources: ["A sales channel"],
  },

  // --- Inventory statuses --------------------------------------------------
  // Classified in cfo-backend/src/modules/calc/inventory.ts, in this order —
  // the first matching branch wins, which is why "out of stock" beats every
  // velocity-based answer and "no SKU data" beats "slow-moving".
  "status-out-of-stock": {
    title: "Out of stock",
    what: "Zero units on hand. Nothing else about this SKU matters until that changes.",
    formula: "Quantity on hand = 0",
    sources: ["A sales channel that reports stock"],
  },
  "status-unknown": {
    title: "No SKU data",
    what: "This variant carries no SKU, so its stock cannot be matched to any sales history.",
    formula: "Variant has no SKU string",
    sources: ["A SKU set on the variant in your store"],
    caveat:
      "Stock and sales come from two different endpoints with no shared key — SKU is the only thing that links them. Without one, this SKU is invisible to every cover calculation rather than being guessed at.",
  },
  "status-slow-moving": {
    title: "Slow-moving",
    what: "Stock that is not turning over — either it has sold nothing at all recently, or it would take more than three months to sell through.",
    formula: "Zero units sold in the trailing 30 days, OR days of cover > 90",
    sources: ["A sales channel"],
  },
  "status-stockout-risk": {
    title: "Stockout risk",
    what: "This SKU runs out inside two weeks at the rate it has been selling.",
    formula: "Days of cover < 14, where cover = quantity on hand ÷ (units sold in the trailing 30 days ÷ 30)",
    sources: ["A sales channel"],
  },
  "status-healthy": {
    title: "Healthy",
    what: "Selling steadily, with between two weeks and three months of stock on hand.",
    formula: "Days of cover between 14 and 90",
    sources: ["A sales channel"],
  },

  // --- Table columns -------------------------------------------------------
  "col-revenue": {
    title: "Revenue (per product)",
    what: "Net revenue attributable to this SKU — line value, less its share of discount and tax, less refunds.",
    formula: "Line value − discount − tax − refunds, per SKU",
    sources: ["A sales channel"],
    caveat:
      "Where a channel reports discount and tax only at ORDER level, they are pushed down to lines revenue-weighted, and the last line absorbs the rounding remainder so per-SKU revenue always sums back to the order total exactly.",
    spec: "§41",
  },
  "col-cogs": {
    title: "COGS (per product)",
    what: "What the units of this SKU sold in the period cost you to buy.",
    formula: "Landed cost × units sold",
    sources: ["Product costs"],
    caveat: "Shows “—”, never zero, for a SKU with no cost on file. Zero cost is a specific and wrong claim.",
  },
  "col-contribution": {
    title: "Contribution (per product)",
    what: "What this SKU contributed before any shipping, fees or advertising.",
    formula: "Net revenue − product cost (CM0)",
    sources: ["Product costs", "A sales channel"],
    caveat: "Stops at CM0. Per-SKU shipping, RTO and ad allocation would need inputs that do not exist, so they are not guessed at.",
    spec: "§40",
  },
  "col-margin": {
    title: "Margin %",
    what: "Contribution as a share of this SKU's net revenue.",
    formula: "CM0 ÷ net revenue, per SKU",
    sources: ["Product costs", "A sales channel"],
    spec: "§37",
  },
  "col-expected": {
    title: "Expected",
    what: "What the order says should have been collected.",
    formula: "Order gross amount",
    sources: ["A sales channel"],
  },
  "col-received": {
    title: "Received",
    what: "What was actually captured against this order by the payment gateway.",
    formula: "Sum of captured payments on the order",
    sources: ["A payment gateway"],
  },

  // --- Charts --------------------------------------------------------------
  "chart-revenue-vs-cash": {
    title: "Net revenue vs cash received",
    what: "Two different truths on one axis: what you earned, and what actually arrived in the bank. The gap between them is settlement lag.",
    formula: "Net revenue recognised at order placement (§11) against matched bank credits (§44), bucketed over the window",
    sources: ["A sales channel", "A bank account"],
    caveat:
      "Buckets before your bank data begins carry NO cash figure rather than a zero — a flat zero line beside a rising revenue line would read as 'none of this was ever collected', which is a far stronger and completely false claim.",
    spec: "§11/§44",
  },
  "chart-revenue-by-channel": {
    title: "Net revenue by channel",
    what: "Where the revenue came from, over the selected period.",
    formula: "Net revenue grouped by the order's channel",
    sources: ["A sales channel"],
    excludes: "Shipping, fees and ad spend are not allocated per channel, so this is revenue only — not channel profitability.",
  },
  "chart-margin-trend": {
    title: "Contribution margin trend",
    what: "How margin has moved over time.",
    formula: "Contribution margin, computed per historical bucket",
    sources: ["Product costs on historical orders"],
    caveat:
      "Needs product costs on past orders. Without them it would draw a flat 100% line, which looks like a spectacular business rather than absent data.",
  },
  "chart-cash-forecast": {
    title: "30-day cash forecast",
    what: "Where the bank balance is heading, day by day, from confirmed and probable flows.",
    formula: "closing(d) = closing(d−1) + inflow(d) − outflow(d)",
    sources: ["A bank account", "A sales channel", "An accounting system for outflows"],
    caveat:
      "The only number here that cannot be checked against a source, so every component declares its own basis — measured, assumed, or unavailable. With no outflow data the projection marks itself unreliable rather than drawing a line that rises forever.",
    spec: "§83/§84",
  },

  // --- Things that describe the data rather than the money ----------------
  "days of cover": {
    what: "How many days your current stock would last at the rate it has been selling.",
    formula: "Quantity on hand ÷ average daily units sold over the trailing sales window",
    sources: ["A sales channel"],
    caveat: "A SKU with no sales in the window has no meaningful cover figure — infinite cover and no demand are the same arithmetic.",
  },
  "settlement lag": {
    what: "How long money takes to travel from the customer to your bank.",
    formula: "Date of matched bank credit − date of the order it settles",
    sources: ["A payment gateway or courier", "A bank account"],
  },
  "formula version": {
    what: "Which version of the calculation produced this number.",
    formula: "A version tag stored alongside every snapshot",
    sources: ["The calc engine"],
    caveat:
      "Historical snapshots are never rewritten when a formula changes — they keep the version that produced them, so a number you saw last month still means what it meant last month.",
    spec: "§92",
  },
  "recognition basis": {
    what: "The moment revenue is counted: when the order is placed, or when it is delivered.",
    formula: "An organisation-level setting, currently fixed at order-created",
    sources: ["The calc engine"],
    caveat:
      "Always reported explicitly rather than left implicit. Reading a delivered-basis number while the engine computed an order-created one is precisely the ambiguity §1 forbids.",
    spec: "§8",
  },
};

// Lookup by explicit term id first, then by visible label.
export function getDefinition(key) {
  if (typeof key !== "string") return null;
  return DEFINITIONS[key] ?? DEFINITIONS[normalise(key)] ?? null;
}

export function hasDefinition(key) {
  return getDefinition(key) !== null;
}

// Kept under the old names so the metric cards read the way they did before the
// registry grew beyond metrics.
export const getMetricDefinition = getDefinition;
export const hasMetricDefinition = hasDefinition;
