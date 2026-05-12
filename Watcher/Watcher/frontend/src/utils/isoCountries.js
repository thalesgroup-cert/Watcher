/**
 * ISO 3166-1 alpha-2 → exact TopoJSON country name (world-atlas countries-110m).
 * Used everywhere: ransomware victims, RSS sources.
 */
export const ISO2_TO_GEO = {
    AF: 'Afghanistan',
    AL: 'Albania',
    DZ: 'Algeria',
    AO: 'Angola',
    AQ: 'Antarctica',
    AR: 'Argentina',
    AM: 'Armenia',
    AU: 'Australia',
    AT: 'Austria',
    AZ: 'Azerbaijan',
    BS: 'Bahamas',
    BH: 'Bahrain',
    BD: 'Bangladesh',
    BY: 'Belarus',
    BE: 'Belgium',
    BZ: 'Belize',
    BJ: 'Benin',
    BT: 'Bhutan',
    BO: 'Bolivia',
    BA: 'Bosnia and Herz.',
    BW: 'Botswana',
    BR: 'Brazil',
    BN: 'Brunei',
    BG: 'Bulgaria',
    BF: 'Burkina Faso',
    BI: 'Burundi',
    KH: 'Cambodia',
    CM: 'Cameroon',
    CA: 'Canada',
    CF: 'Central African Rep.',
    TD: 'Chad',
    CL: 'Chile',
    CN: 'China',
    CO: 'Colombia',
    CG: 'Congo',
    CR: 'Costa Rica',
    HR: 'Croatia',
    CU: 'Cuba',
    CY: 'Cyprus',
    CZ: 'Czechia',
    CI: "Côte d'Ivoire",
    CD: 'Dem. Rep. Congo',
    DK: 'Denmark',
    DJ: 'Djibouti',
    DO: 'Dominican Rep.',
    EC: 'Ecuador',
    EG: 'Egypt',
    SV: 'El Salvador',
    GQ: 'Eq. Guinea',
    ER: 'Eritrea',
    EE: 'Estonia',
    ET: 'Ethiopia',
    FK: 'Falkland Is.',
    FJ: 'Fiji',
    FI: 'Finland',
    FR: 'France',
    GA: 'Gabon',
    GM: 'Gambia',
    GE: 'Georgia',
    DE: 'Germany',
    GH: 'Ghana',
    GR: 'Greece',
    GL: 'Greenland',
    GT: 'Guatemala',
    GN: 'Guinea',
    GW: 'Guinea-Bissau',
    GY: 'Guyana',
    HT: 'Haiti',
    HN: 'Honduras',
    HU: 'Hungary',
    IS: 'Iceland',
    IN: 'India',
    ID: 'Indonesia',
    IR: 'Iran',
    IQ: 'Iraq',
    IE: 'Ireland',
    IL: 'Israel',
    IT: 'Italy',
    JM: 'Jamaica',
    JP: 'Japan',
    JO: 'Jordan',
    KZ: 'Kazakhstan',
    KE: 'Kenya',
    XK: 'Kosovo',
    KW: 'Kuwait',
    KG: 'Kyrgyzstan',
    LA: 'Laos',
    LV: 'Latvia',
    LB: 'Lebanon',
    LS: 'Lesotho',
    LR: 'Liberia',
    LY: 'Libya',
    LT: 'Lithuania',
    LU: 'Luxembourg',
    MK: 'Macedonia',
    MG: 'Madagascar',
    MW: 'Malawi',
    MY: 'Malaysia',
    ML: 'Mali',
    MR: 'Mauritania',
    MX: 'Mexico',
    MD: 'Moldova',
    MN: 'Mongolia',
    ME: 'Montenegro',
    MA: 'Morocco',
    MZ: 'Mozambique',
    MM: 'Myanmar',
    NA: 'Namibia',
    NP: 'Nepal',
    NL: 'Netherlands',
    NC: 'New Caledonia',
    NZ: 'New Zealand',
    NI: 'Nicaragua',
    NE: 'Niger',
    NG: 'Nigeria',
    KP: 'North Korea',
    NO: 'Norway',
    OM: 'Oman',
    PK: 'Pakistan',
    PS: 'Palestine',
    PA: 'Panama',
    PG: 'Papua New Guinea',
    PY: 'Paraguay',
    PE: 'Peru',
    PH: 'Philippines',
    PL: 'Poland',
    PT: 'Portugal',
    PR: 'Puerto Rico',
    QA: 'Qatar',
    RO: 'Romania',
    RU: 'Russia',
    RW: 'Rwanda',
    SS: 'S. Sudan',
    SA: 'Saudi Arabia',
    SN: 'Senegal',
    RS: 'Serbia',
    SL: 'Sierra Leone',
    SK: 'Slovakia',
    SI: 'Slovenia',
    SB: 'Solomon Is.',
    SO: 'Somalia',
    ZA: 'South Africa',
    KR: 'South Korea',
    ES: 'Spain',
    LK: 'Sri Lanka',
    SD: 'Sudan',
    SR: 'Suriname',
    SZ: 'eSwatini',
    SE: 'Sweden',
    CH: 'Switzerland',
    SY: 'Syria',
    TW: 'Taiwan',
    TJ: 'Tajikistan',
    TZ: 'Tanzania',
    TH: 'Thailand',
    TL: 'Timor-Leste',
    TG: 'Togo',
    TT: 'Trinidad and Tobago',
    TN: 'Tunisia',
    TR: 'Turkey',
    TM: 'Turkmenistan',
    UG: 'Uganda',
    UA: 'Ukraine',
    AE: 'United Arab Emirates',
    GB: 'United Kingdom',
    US: 'United States of America',
    UY: 'Uruguay',
    UZ: 'Uzbekistan',
    VU: 'Vanuatu',
    VE: 'Venezuela',
    VN: 'Vietnam',
    EH: 'W. Sahara',
    YE: 'Yemen',
    ZM: 'Zambia',
    ZW: 'Zimbabwe',
};

/**
 * Convert an ISO alpha-2 code to the TopoJSON geo name.
 * Accepts both "US" and "us". Returns null for empty input.
 */
export function isoToGeoName(code) {
    if (!code || !code.trim()) return null;
    return ISO2_TO_GEO[code.trim().toUpperCase()] || null;
}

/**
 * Reverse map: TopoJSON geo name → ISO alpha-2 code.
 */
export const GEO_TO_ISO = Object.fromEntries(
    Object.entries(ISO2_TO_GEO).map(([iso, geo]) => [geo, iso])
);

/**
 * Build a { geoName → count } map from an array of objects.
 * countryField must contain an ISO alpha-2 code (e.g. "country" field).
 */
export function buildCountryCountMap(items, countryField) {
    const counts = {};
    items.forEach(item => {
        const geoName = isoToGeoName(item[countryField]);
        if (geoName) counts[geoName] = (counts[geoName] || 0) + 1;
    });
    return counts;
}

/**
 * Convert an ISO 3166-1 alpha-2 code to an emoji flag.
 */
export function isoToFlag(code) {
    if (!code || code.length !== 2) return '';
    return code.toUpperCase().split('').map(c =>
        String.fromCodePoint(c.charCodeAt(0) + 127397)
    ).join('');
}
