from .base import link_to, render_email


def get_cyber_watch_template(context_data, link_url=None):
    kind = context_data.get('notification_type', '')
    get = context_data.get

    if kind == 'new_cve':
        title, intro = "New CVE Detected", "A new CVE has been published."
        rows = [('CVE ID', get('cve_id')), ('Severity', get('severity')), ('CVSS score', get('cvss_score')),
                ('Description', get('description'))]
    elif kind == 'cve_hit':
        title, intro = "CVE Watch Rule Hit", "A CVE matches one of your watch rules."
        rows = [('Rule', get('rule_name')), ('CVE ID', get('cve_id')), ('Matched keyword', get('keyword')),
                ('Severity', get('severity'))]
    elif kind == 'cve_exploited':
        title, intro = "CVE Exploited in the Wild", "CISA has added a CVE to its catalogue of the vulnerabilities exploited in the wild."
        rows = [('CVE ID', get('cve_id')), ('Severity', get('severity')), ('CVSS score', get('cvss_score')),
                ('EPSS', get('epss')), ('Fix by', get('fix_by')), ('Ransomware', get('ransomware')),
                ('Description', get('description'))]
    elif kind == 'new_victim':
        title, intro = "New Ransomware Victim Detected", "A ransomware group claimed a new victim."
        rows = [('Victim', get('victim_name')), ('Group', get('group_name')), ('Country', get('country')),
                ('Sector', get('sector'))]
    elif kind == 'victim_hit':
        title, intro = "Ransomware Victim Watch Rule Hit", "A ransomware victim matches one of your watch rules."
        rows = [('Rule', get('rule_name')), ('Victim', get('victim_name')), ('Group', get('group_name')),
                ('Sector', get('sector')), ('Country', get('country')), ('Matched keyword', get('keyword'))]
    else:
        title, intro, rows = "CyberWatch Alert", "A new CyberWatch event has been detected.", []

    return render_email(title=title, intro=intro, rows=rows, link=link_url or link_to('cyber_watch'))
