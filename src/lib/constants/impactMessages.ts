export function getImpactMessage(amount: number): string {
  if (amount < 1) return "Every cent counts!";
  if (amount < 3) return `$${amount.toFixed(2)} = seeds for a family garden 🌱`;
  if (amount < 5) return `$${amount.toFixed(2)} = 1 day of clean water for a child 💧`;
  if (amount < 8) return `$${amount.toFixed(2)} = 1 school meal 🍽️`;
  if (amount < 12) return `$${amount.toFixed(2)} = a week of vitamins for a child 💊`;
  if (amount < 15) return `$${amount.toFixed(2)} = textbooks for a week 📚`;
  if (amount < 20) return `$${amount.toFixed(2)} = a child's school supplies 🎒`;
  if (amount < 30) return `$${amount.toFixed(2)} = vaccinations for 2 children 💉`;
  if (amount < 50) return `$${amount.toFixed(2)} = a month of school lunches 🥗`;
  if (amount < 100) return `$${amount.toFixed(2)} = sponsor a child for a month 🌟`;
  if (amount < 150) return `$${amount.toFixed(2)} = a mobile library visit 📖`;
  if (amount < 200) return `$${amount.toFixed(2)} = women's health education 👩‍⚕️`;
  return `$${amount.toFixed(2)} = educate a child for a year! 🎓`;
}

export const MILESTONE_MESSAGES: Record<number, string> = {
  10: "Your first $10! A child has clean water today. 💧",
  25: "$25 saved! That's 5 school meals. 🍽️",
  50: "$50 saved! You've funded a month of vitamins. 💊",
  100: "$100 saved! A child's school supplies covered. 🎒",
  150: "$150 saved! A mobile library can visit a village. 📖",
  180: "$180 saved! A child can go to school for a year. 🎓",
  200: "$200 saved! Life-changing impact. You're a hero. 🌟",
  500: "$500! You've changed multiple lives. 🌍",
};
