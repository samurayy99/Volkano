export function buildMailtoHref(address: string, subject: string, body = "") {
  const query = [`subject=${encodeURIComponent(subject)}`];
  if (body) query.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${address}?${query.join("&")}`;
}
