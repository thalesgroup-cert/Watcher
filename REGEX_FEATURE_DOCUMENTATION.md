# Regex Support for Data Leak Keywords - Enhancement Documentation

## Overview

This enhancement adds regular expression (regex) pattern matching support to the Watcher Data Leak monitoring system, implementing [Issue #48](https://github.com/thalesgroup-cert/Watcher/issues/48). This feature enables advanced pattern matching for detecting complex data leak patterns such as:

- Email addresses
- Credit card numbers
- Social Security Numbers (SSNs)
- IP addresses
- API keys and tokens
- Custom data patterns specific to your organization

## Security Focus

As a cybersecurity threat hunting platform, this enhancement prioritizes security in several ways:

### 1. Input Validation & Sanitization
- **Regex Pattern Validation**: All regex patterns are validated using Python's `re.compile()` before storage
- **Error Handling**: Invalid regex patterns are rejected with clear error messages
- **SQL Injection Prevention**: Uses Django ORM parameterized queries
- **XSS Protection**: Frontend properly escapes regex patterns in display

### 2. Performance Security
- **DoS Protection**: Basic validation against catastrophic backtracking patterns
- **Pattern Length Limits**: Regex patterns limited to 500 characters
- **Timeout Considerations**: Production deployments should implement regex timeout limits

### 3. Access Control
- **Authentication Required**: All regex keyword operations require proper authentication
- **Permission Checks**: Uses Django's built-in permission system
- **Audit Trail**: All keyword modifications are logged with timestamps

## Implementation Details

### Backend Changes

#### 1. Database Schema (`models.py`)
```python
class Keyword(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_regex = models.BooleanField(default=False, verbose_name="Use as Regex Pattern")
    regex_pattern = models.CharField(
        max_length=500, 
        blank=True, 
        null=True,
        validators=[validate_regex],
        verbose_name="Regex Pattern"
    )
    created_at = models.DateTimeField(default=timezone.now)
```

#### 2. Core Logic Enhancement (`core.py`)
- **Searx Integration**: Enhanced `check_searx()` to apply regex patterns to search results
- **Pastebin Monitoring**: Updated `check_pastebin()` to use regex for content matching
- **Fallback Mechanism**: Automatic fallback to simple string matching if regex fails

#### 3. API Validation (`serializers.py`)
- **Custom Validation**: Ensures regex pattern is provided when `is_regex=True`
- **Pattern Testing**: Validates regex syntax before saving
- **Error Messages**: Provides clear feedback for invalid patterns

### Frontend Changes

#### 1. React Component Updates (`KeyWords.js`)
- **Enhanced Forms**: Added regex checkbox and pattern input fields
- **Visual Indicators**: Table shows "Regex" vs "Exact" badges for easy identification
- **Pattern Display**: Shows regex patterns in formatted code blocks
- **Form Validation**: Client-side validation for regex requirements

#### 2. User Interface Improvements
- **Modal Enhancements**: Add/Edit modals support regex configuration
- **Help Text**: Provides examples and guidance for regex patterns
- **Responsive Design**: Maintains mobile-friendly interface

### Admin Interface

#### 1. Django Admin Enhancements (`admin.py`)
- **Fieldsets**: Organized regex settings in collapsible section
- **List Display**: Shows regex status and patterns in keyword list
- **Search**: Enables searching by regex patterns
- **Filtering**: Allows filtering by regex vs exact keywords

## Usage Examples

### Common Security Patterns

#### 1. Email Detection
```
Name: Email Detection
Pattern: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
```

#### 2. Credit Card Numbers
```
Name: Credit Card Detection
Pattern: \b(?:\d{4}[-\s]?){3}\d{4}\b
```

#### 3. Social Security Numbers
```
Name: SSN Detection
Pattern: \b\d{3}-\d{2}-\d{4}\b
```

#### 4. IP Addresses
```
Name: IP Address Detection
Pattern: \b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b
```

#### 5. API Keys (Generic)
```
Name: API Key Detection
Pattern: [Aa][Pp][Ii][-_]?[Kk][Ee][Yy][-_]?[:\s]?[a-zA-Z0-9]{20,}
```

### Advanced Use Cases

#### 1. Custom Organization Patterns
```
Name: Employee ID Pattern
Pattern: EMP\d{6}
```

#### 2. Internal System References
```
Name: Ticket Number Pattern
Pattern: TICK-\d{4}-\d{6}
```

## Testing Coverage

### 1. Unit Tests
- **Model Validation**: Tests for regex pattern validation
- **Core Logic**: Tests for regex matching in Searx and Pastebin
- **API Endpoints**: Tests for CRUD operations with regex keywords

### 2. Integration Tests
- **End-to-End Workflow**: Complete data leak detection with regex patterns
- **Mixed Keyword Types**: Systems using both exact and regex keywords
- **Error Handling**: Graceful degradation when regex fails

### 3. Security Tests
- **Input Validation**: Tests against malicious regex patterns
- **DoS Protection**: Tests for catastrophic backtracking prevention
- **Safe Patterns**: Verification of common security patterns

## Migration Guide

### 1. Database Migration
```bash
python manage.py migrate data_leak 0012_keyword_regex_support
```

### 2. Existing Keywords
- All existing keywords remain as "exact match" by default
- No manual intervention required for existing data
- Can be upgraded to regex patterns through UI or admin interface

### 3. Backward Compatibility
- Existing API endpoints continue to work
- Frontend gracefully handles keywords without regex fields
- No breaking changes to existing functionality

## Performance Considerations

### 1. Regex Compilation
- Patterns are compiled once during matching
- Consider caching compiled regex objects for high-volume scenarios

### 2. Search Strategy
- Searx: Uses keyword name for initial search, applies regex to results
- Pastebin: Direct regex application to content
- Fallback to simple string matching if regex fails

### 3. Monitoring Recommendations
- Monitor regex execution time in production
- Implement alerts for regex timeout errors
- Consider pattern complexity limits for high-volume environments

## Security Recommendations

### 1. Pattern Review Process
- Implement review process for new regex patterns
- Validate patterns for security implications
- Test patterns in safe environment before production

### 2. Monitoring & Alerting
- Monitor for regex DoS attempts
- Alert on pattern validation failures
- Track regex performance metrics

### 3. Access Controls
- Limit regex pattern creation to security team members
- Implement approval workflow for complex patterns
- Regular audit of active regex patterns

## Future Enhancements

### 1. Pattern Library
- Pre-built library of common security patterns
- Community-contributed pattern sharing
- Pattern effectiveness analytics

### 2. Advanced Features
- Pattern testing interface with sample data
- Regex performance profiling
- Pattern optimization suggestions

### 3. Machine Learning Integration
- Auto-generation of patterns from sample data
- Pattern effectiveness scoring
- False positive reduction

## Troubleshooting

### Common Issues

#### 1. Invalid Regex Pattern
**Error**: "Invalid regex pattern: unterminated character set"
**Solution**: Check for unmatched brackets, parentheses, or special characters

#### 2. Pattern Not Matching
**Error**: Expected matches not found
**Solution**: Test pattern with online regex tester, verify case sensitivity

#### 3. Performance Issues
**Error**: Slow regex execution
**Solution**: Simplify pattern, avoid nested quantifiers, use atomic groups

### Debug Mode

Enable Django debug mode to see detailed regex error messages:
```python
# settings.py
DEBUG = True
LOGGING = {
    'version': 1,
    'handlers': {
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': 'regex_debug.log',
        },
    },
    'loggers': {
        'data_leak.core': {
            'handlers': ['file'],
            'level': 'DEBUG',
        },
    },
}
```

## Conclusion

This regex enhancement significantly expands Watcher's threat detection capabilities while maintaining security best practices. The implementation provides a robust foundation for advanced pattern matching with proper validation, error handling, and performance considerations.

The feature has been thoroughly tested and maintains backward compatibility with existing functionality. Security teams can now create sophisticated detection patterns for modern cybersecurity threats while maintaining the reliability and performance of the Watcher platform.