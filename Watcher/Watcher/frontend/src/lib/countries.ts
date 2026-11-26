/** Flag emoji of an ISO 3166-1 alpha-2 code ("FR" gives 🇫🇷), or an empty string. */
export function isoToFlag(code: string): string {
    if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
    return [...code.toUpperCase()].map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
}
