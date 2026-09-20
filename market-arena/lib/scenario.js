// The market: who the customers are, and what a first round looks like.
// Edit PERSONAS to change the market. Keep each profile concrete and behavioural.
export const SCENARIO = {
  id: "cold-brew-india",
  title: "Cold brew comes to India",
  brief:
    "Ready-to-drink cold coffee is new to most Indian shoppers. Twelve customers across four segments will see every brand's ad side by side and decide what, if anything, to buy.",
};

export const PERSONAS = [
  { id: "p1", name: "Aarav", segment: "Hustling professionals", profile: "28, product manager in Bengaluru, works 10-hour days, drinks 3 coffees a day, values time over money, orders on Swiggy Instamart often" },
  { id: "p2", name: "Meera", segment: "Hustling professionals", profile: "31, investment analyst in Mumbai, long commute, wants energy without a sugar crash, skeptical of health claims" },
  { id: "p3", name: "Kabir", segment: "Hustling professionals", profile: "26, startup founder in Gurugram, early adopter, follows D2C brands on Instagram, cares about brand story" },
  { id: "p4", name: "Rohan", segment: "Students on a budget", profile: "20, engineering student in Pune, monthly allowance of Rs 8000, drinks cutting chai, splurges only on weekends" },
  { id: "p5", name: "Isha", segment: "Students on a budget", profile: "22, MBA student in Ahmedabad, price-sensitive, influenced by friends and campus trends, pulls all-nighters before exams" },
  { id: "p6", name: "Tara", segment: "Students on a budget", profile: "19, design student in Delhi, aesthetics-driven, buys things that look good on Instagram, limited budget" },
  { id: "p7", name: "Lakshmi", segment: "Health-conscious", profile: "35, yoga instructor in Chennai, avoids sugar and additives, reads every ingredient label, prefers natural products" },
  { id: "p8", name: "Dr. Sameer", segment: "Health-conscious", profile: "40, doctor in Hyderabad, limits caffeine, distrusts marketing buzzwords, wants clinical facts" },
  { id: "p9", name: "Nikhil", segment: "Health-conscious", profile: "29, marathon runner in Bengaluru, tracks macros, wants pre-workout energy, drinks black coffee" },
  { id: "p10", name: "Venkatesh", segment: "Filter-coffee loyalists", profile: "45, bank manager in Coimbatore, drinks filter coffee made at home every morning, thinks packaged coffee is overpriced" },
  { id: "p11", name: "Saroja", segment: "Filter-coffee loyalists", profile: "52, homemaker in Mysuru, buys coffee powder from the same local store for 20 years, rarely shops online" },
  { id: "p12", name: "Anjali", segment: "Filter-coffee loyalists", profile: "38, school teacher in Kochi, loves strong South Indian coffee, curious but cautious about new products" },
];

export const OBJECTIONS = {
  price: "The price feels too high for what it is",
  trust: "Does not believe the claims or the brand",
  relevance: "The product does not fit their needs or habits",
  unclear: "Does not understand what is being offered",
  none: "No significant objection; open to trying it",
};

export const DEFAULT_TEAMS = [
  { brand: "BrewRush", headline: "Wake up. Win the day.", valueProp: "Double-strength cold brew in a can. 200mg caffeine. Zero prep, just crack and go.", price: "Rs 120 per 250ml can" },
  { brand: "PureBean", headline: "Just coffee. Nothing else.", valueProp: "Cold brew made from single-origin Chikmagalur arabica, steeped 18 hours. No sugar, no preservatives, no additives.", price: "Rs 150 per 250ml bottle" },
  { brand: "ChillSip", headline: "The coolest thing you'll drink all week", valueProp: "Fun flavoured cold coffee in hazelnut, caramel and mocha. Share it, snap it, love it.", price: "Rs 60 per 200ml bottle" },
];
