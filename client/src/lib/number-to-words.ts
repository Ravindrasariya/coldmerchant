const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function convertChunk(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return tens[t] + (o ? " " + ones[o] : "");
  }
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (rem > 0) return ones[h] + " Hundred " + convertChunk(rem);
  return ones[h] + " Hundred";
}

export function numberToIndianWords(amount: number): string {
  if (amount === 0) return "Rupees Zero Only";

  const isNegative = amount < 0;
  amount = Math.abs(amount);

  let rupees = Math.floor(amount);
  let paise = Math.round((amount - rupees) * 100);

  if (paise >= 100) {
    rupees += 1;
    paise = 0;
  }

  let words = "";

  if (rupees > 0) {
    const parts: string[] = [];

    const crore = Math.floor(rupees / 10000000);
    if (crore > 0) {
      parts.push(convertChunk(crore) + " Crore");
      rupees = rupees % 10000000;
    }

    const lakh = Math.floor(rupees / 100000);
    if (lakh > 0) {
      parts.push(convertChunk(lakh) + " Lakh");
      rupees = rupees % 100000;
    }

    const thousand = Math.floor(rupees / 1000);
    if (thousand > 0) {
      parts.push(convertChunk(thousand) + " Thousand");
      rupees = rupees % 1000;
    }

    if (rupees > 0) {
      parts.push(convertChunk(rupees));
    }

    words = (isNegative ? "Minus " : "") + "Rupees " + parts.join(" ");
  }

  if (paise > 0) {
    const paiseWords = convertChunk(paise);
    if (words) {
      words += " and " + paiseWords + " Paise Only";
    } else {
      words = (isNegative ? "Minus " : "") + paiseWords + " Paise Only";
    }
  } else {
    words += " Only";
  }

  return words.trim();
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
