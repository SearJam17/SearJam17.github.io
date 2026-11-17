// Upcoming UFC events snapshot. Refreshed by a weekly scheduled task.
// The page hides any event whose date has passed, so this list never shows old events as upcoming.
// Dates are local event dates (YYYY-MM-DD). Only facts confirmed by a current source go here.
window.UPCOMING_EVENTS = {
  checked: "2026-11-16",
  events: [
    { name: "UFC Fight Night", date: "2026-11-21", red: "Procházka", blue: "Stirling",
      venue: "ABHA Arena", city: "Doha, Qatar",
      url: "https://www.ufc.com/event/ufc-fight-night-november-21-2026" },
    { name: "UFC Fight Night", date: "2026-12-05", red: "Adesanya", blue: "Magomedov",
      venue: "ANB Arena", city: "Riyadh, Saudi Arabia",
      url: "https://www.ufc.com/event/ufc-fight-night-december-05-2026" },
    { name: "UFC 335", date: "2026-12-12", red: "Oliveira", blue: "Lopes",
      venue: "T-Mobile Arena", city: "Las Vegas, NV, United States",
      url: "https://www.ufc.com/event/ufc-335" },
    { name: "UFC Fight Night", date: "2027-01-16", red: "Rodriguez", blue: "Garcia",
      venue: "American Airlines Center", city: "Dallas, TX, United States",
      url: "https://www.ufc.com/event/ufc-fight-night-january-16-2027" },
    { name: "UFC Fight Night", date: "2027-01-23", red: "Bonfim", blue: "Brady",
      venue: "Meta APEX", city: "Las Vegas, NV, United States",
      url: "https://www.ufc.com/event/ufc-fight-night-january-23-2027" },
    { name: "UFC 336", date: "2027-01-30", red: "Van", blue: "Kape",
      venue: "Scotiabank Arena", city: "Toronto, ON, Canada",
      url: "https://www.ufc.com/event/ufc-336" },
    { name: "UFC Fight Night", date: "2027-02-07", red: "Salkilld", blue: "Saint Denis",
      venue: "Afterpay Arena", city: "Sydney, NSW, Australia",
      url: "https://www.ufc.com/event/ufc-fight-night-february-06-2027" },
    { name: "UFC Fight Night", date: "2027-02-13", red: "Pyfer", blue: "Nickal",
      venue: "Rocket Arena", city: "Cleveland, OH, United States",
      url: "https://www.ufc.com/event/ufc-fight-night-february-13-2027" },
    { name: "UFC 337", date: "2027-02-20", red: null, blue: null,
      venue: "Kia Center", city: "Orlando, FL, United States",
      url: "https://www.ufc.com/event/ufc-337" }
  ]
};
