/** Ready-made regular expressions, offered in the pattern dialog. */
export interface PatternTemplate {
    name: string;
    pattern: string;
    description: string;
}

export const PATTERN_TEMPLATES: Record<string, PatternTemplate[]> = {
    'Data Leaks & Breaches': [
        { name: 'Leak Keywords', pattern: '(leak|breach|dump|database)', description: 'Common leak-related terms' },
        { name: 'Data Dump', pattern: 'data[_-]?(dump|leak|breach)', description: 'Data dump variations' },
        { name: 'Password Files', pattern: '(password|passwd|credentials)\\.(txt|csv|sql)', description: 'Password file patterns' },
        { name: 'Company Leak', pattern: 'company[_-]?(leak|dump|data)', description: 'Company-specific leaks' },
    ],
    'Credentials & Auth': [
        { name: 'Email Pattern', pattern: '[a-zA-Z0-9._%+-]+@company\\.com', description: 'Company email addresses' },
        { name: 'Email with Password', pattern: '[^\\s]+@[^\\s]+:[^\\s]+', description: 'Email:password format' },
        { name: 'Username:Password', pattern: '[a-zA-Z0-9_]+:[^\\s]+', description: 'Credential pairs' },
        { name: 'API Keys', pattern: 'api[_-]?key|apikey|api[_-]?secret', description: 'API key patterns' },
        { name: 'Bearer Tokens', pattern: 'Bearer [A-Za-z0-9\\-._~+/]+', description: 'JWT Bearer tokens' },
    ],
    'Sensitive Data': [
        { name: 'Credit Card', pattern: '\\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\\b', description: 'Card number format' },
        { name: 'SSN Pattern', pattern: '\\b[0-9]{3}-[0-9]{2}-[0-9]{4}\\b', description: 'Social Security Number' },
        { name: 'Phone Numbers', pattern: '\\+?[0-9]{1,3}[-\\.\\s]?\\(?[0-9]{1,4}\\)?[-\\.\\s]?[0-9]{1,4}[-\\.\\s]?[0-9]{1,9}', description: 'International phone' },
        { name: 'Secret/Confidential', pattern: '(secret|confidential|private|internal)', description: 'Sensitive labels' },
        { name: 'Private Key Headers', pattern: '-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----', description: 'Private key detection' },
    ],
    'Database & Infrastructure': [
        { name: 'Database URI', pattern: '(mongodb|mysql|postgres|redis)://[^\\s]+', description: 'Database connection strings' },
        { name: 'Connection String', pattern: 'Server=[^;]+;Database=[^;]+;', description: 'SQL Server connections' },
        { name: 'AWS Keys', pattern: 'AKIA[0-9A-Z]{16}', description: 'AWS Access Key ID' },
        { name: 'AWS Secret', pattern: '[A-Za-z0-9/+=]{40}', description: 'AWS Secret Access Key' },
        { name: 'IPv4 Address', pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b', description: 'IP address pattern' },
    ],
    'File Patterns': [
        { name: 'Archive Files', pattern: '\\.(zip|rar|7z|tar\\.gz|tgz)$', description: 'Compressed archives' },
        { name: 'Database Files', pattern: '\\.(sql|db|sqlite|mdb)$', description: 'Database file extensions' },
        { name: 'Backup Files', pattern: '\\.(bak|backup|old|~)$', description: 'Backup file patterns' },
        { name: 'Config Files', pattern: '\\.(conf|config|ini|env)$', description: 'Configuration files' },
        { name: 'Log Files', pattern: '\\.(log|logs)$', description: 'Log file extensions' },
    ],
    'Code & Secrets': [
        { name: 'GitHub Token', pattern: 'ghp_[A-Za-z0-9]{36}', description: 'GitHub personal access token' },
        { name: 'Slack Token', pattern: 'xox[baprs]-[0-9]{10,12}-[0-9]{10,12}-[a-zA-Z0-9]{24}', description: 'Slack API tokens' },
        { name: 'Generic Secret', pattern: '(secret|password|passwd|pwd)\\s*[:=]\\s*["\']?[^\\s"\';]+', description: 'Secret assignments' },
        { name: 'Private Repo', pattern: 'github\\.com/[^/]+/[^/]+', description: 'GitHub repository URLs' },
        { name: 'SSH Keys', pattern: 'ssh-(rsa|dss|ed25519) [A-Za-z0-9+/=]+', description: 'SSH public keys' },
    ]
};
