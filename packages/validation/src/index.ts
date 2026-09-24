export function validateEgyptianPhone(phone: string): boolean {
  const clean = phone.replace(/\s+/g, '');
  // Accepts 010, 011, 012, 015 with 11 digits
  const egPhoneRegex = /^01[0125]\d{8}$/;
  return egPhoneRegex.test(clean);
}

export function validateRecipientName(name: string): boolean {
  return name.trim().length >= 3;
}

export function validateStreetAddress(address: string): boolean {
  return address.trim().length >= 5;
}

export function validateSearchQuery(query: string): boolean {
  return query.trim().length >= 2;
}
