interface IdentifierInput {
  editionCode?: string | null;
  cardCode?: string | null;
  cardNumber?: string | null;
  cardName?: string | null;
}

function clean(value?: string | null): string {
  return (value || '').trim();
}

function normalizeToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function looksLikeStructuredCode(value: string): boolean {
  // Structured codes usually include separators or mixed letters+numbers.
  return /[-/]/.test(value) || (/[A-Z]/i.test(value) && /\d/.test(value));
}

function extractCodeFromCardName(rawName: string): string {
  const name = rawName.trim();
  if (!name) return '';

  // Pattern: "Card Name - AD1-001" or "Card Name - FT/S120-E001S SR"
  const dashed = name.match(/\s[-–]\s([A-Za-z0-9][A-Za-z0-9\-/ ]+)$/);
  if (dashed?.[1]) {
    return dashed[1].trim();
  }

  // Pattern where name itself is mostly code-like.
  if (looksLikeStructuredCode(name) && name.length <= 40) {
    return name;
  }

  return '';
}

function collapseDuplicatedCardCode(rawCode: string): string {
  let code = rawCode.trim();
  if (!code) return code;

  // Normalize spacing around separators to improve matching.
  code = code.replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-');

  // Example: FT/-FT/S120-E001S SR -> FT/S120-E001S SR
  code = code.replace(/^([A-Za-z0-9]+\/)\-\1/i, '$1');

  const tokens = code.split('-').map((token) => token.trim()).filter(Boolean);

  // Example: OP01-OP01-002 -> OP01-002
  if (tokens.length >= 3 && normalizeToken(tokens[0]) === normalizeToken(tokens[1])) {
    return [tokens[0], ...tokens.slice(2)].join('-');
  }

  // Example: ABYR-ABYR-EN002 -> ABYR-EN002
  if (tokens.length >= 3 && normalizeToken(tokens[1]).startsWith(normalizeToken(tokens[0]))) {
    return [tokens[1], ...tokens.slice(2)].join('-');
  }

  // Example: AD-01-AD1-001 R -> AD1-001 R
  if (tokens.length >= 4) {
    const first = normalizeToken(tokens[0]);
    const second = normalizeToken(tokens[1]);
    const third = normalizeToken(tokens[2]);
    const secondIsNumeric = /^\d+$/.test(second);
    if (first && secondIsNumeric && third.startsWith(first)) {
      return [tokens[2], ...tokens.slice(3)].join('-');
    }
  }

  return code;
}

export function formatInventoryIdentifier(input: IdentifierInput): string {
  const editionCode = clean(input.editionCode);
  const cardCode = collapseDuplicatedCardCode(clean(input.cardCode));
  const cardNumber = clean(input.cardNumber);
  const cardNameCode = collapseDuplicatedCardCode(extractCodeFromCardName(clean(input.cardName)));

  if (cardCode && looksLikeStructuredCode(cardCode)) {
    return cardCode;
  }

  if (cardNameCode && looksLikeStructuredCode(cardNameCode)) {
    return cardNameCode;
  }

  if (cardNumber && editionCode) {
    const normalizedEdition = normalizeToken(editionCode);
    const normalizedNumber = normalizeToken(cardNumber);

    // If card number already includes the set prefix, do not duplicate it.
    if (normalizedEdition && normalizedNumber.startsWith(normalizedEdition)) {
      return cardNumber;
    }

    return `${editionCode}-${cardNumber}`;
  }

  if (cardCode) {
    return cardCode;
  }

  if (cardNameCode) {
    return cardNameCode;
  }

  if (cardNumber) {
    return cardNumber;
  }

  return '—';
}
