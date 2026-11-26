#!/usr/bin/env python3
"""
Cut ../README.md into the pages of the guide (content/guide/), the one source of the documentation, and write the home
page and the code reference (content/index.md, content/reference/), which only list the modules.

The README stays the file read on GitHub; this script only prepares it for the site, so nothing is written twice:

- each `# ` heading becomes a section of the menu and each `## ` heading a page (a very short one is joined to the next);
- the headings go up one level, the links to `#an-anchor` point to the page that holds the anchor;
- a list that follows a line of text without a blank line, or nested with two spaces (GitHub accepts both), is rewritten
  the way the site's Markdown reads it.

Run it from this folder before `zensical build`: `python build_pages.py`. It also writes mkdocs.yml from
mkdocs.template.yml. What it writes (content/guide/, content/index.md, content/reference/ and mkdocs.yml) is not versioned.
"""
import json
import re
import shutil
import sys
from pathlib import Path

from pymdownx.slugs import slugify

HERE = Path(__file__).resolve().parent
README = HERE.parent / 'README.md'
OUT = HERE / 'content' / 'guide'

HEADING = re.compile(r'^(#{1,6}) +(.*?)\s*$')
LIST_ITEM = re.compile(r'^( *)([-*+]|\d+[.)]) +')
TINY = 6  # a page of fewer lines than this (without its title and blank lines) is joined to the next one

slug = slugify(case='lower')

# The modules of the code reference: (title, Python module, what it holds), in the order of the menu
MODULES = [
    ('Threats Watcher', 'threats_watcher.core', 'RSS ingestion, trending words, keywords, AI summaries'),
    ('Data Leak', 'data_leak.core', 'Leak search across the paste sites and code registries'),
    ('Site Monitoring', 'site_monitoring.core', 'Monitored sites and pages, RDAP, UDRP'),
    ('DNS Finder', 'dns_finder.core', 'Look-alike domains: permutations and Certificate Transparency'),
    ('Cyber Watch', 'cyber_watch.core', 'CVEs, exploited vulnerabilities, ransomware, watch rules, retention'),
    ('Common', 'common.core', 'Notifications, legitimate domains, scheduled checks'),
    ('MISP', 'common.misp', 'The export to MISP'),
]

HOME = """# Watcher

Watcher is the threat detection and monitoring platform of the [Thales Group CERT](https://github.com/thalesgroup-cert). It watches what is aimed at an organisation: trending vulnerabilities and ransomware, advisories from the CERTs, look-alike domains, data leaks and changes on the sites it follows, then sends what it finds to TheHive, MISP, Slack, Citadel or by e-mail.

<div class="grid cards" markdown>

- **[Install](guide/install-watcher/launch-watcher.md)**: run Watcher with Docker in ten minutes.
- **[Use](guide/use-watcher/user-enrollment.md)**: the modules, the connectors, the AI summaries.
- **[Update](guide/update-watcher/index.md)**: move to a new version without losing data.
- **[Developers](guide/developers/index.md)**: contribute, test, build the front.
- **[Code reference](reference/index.md)**: the functions of every module.

</div>

Source and issues: [github.com/thalesgroup-cert/Watcher](https://github.com/thalesgroup-cert/Watcher).
"""


def write_reference():
    """content/index.md and content/reference/: the home page and one page per module, from the MODULES list."""
    out = HERE / 'content' / 'reference'
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (HERE / 'content' / 'index.md').write_text(HOME, encoding='utf-8')
    rows = []
    for title, module, holds in MODULES:
        name = module.replace('.', '_') + '.md'
        (out / name).write_text(f"# {title}\n\nThe functions of {chr(96)}{module}{chr(96)}, taken from their docstrings.\n\n::: {module}\n", encoding='utf-8')
        rows.append(f"| [{title}]({name}) | {holds} |")
    header = "# Code reference\n\nWhat each module does, function by function. The text comes from the docstrings of the code, so it is always the one of the version you read.\n\n| Module | What it holds |\n|---|---|\n"
    (out / 'index.md').write_text(header + '\n'.join(rows) + '\n', encoding='utf-8')


def read_sections(lines):
    """[(level, title, [lines])] with the lines before the first heading under (0, '', ...); fenced code is left alone."""
    sections, current, fenced = [(0, '', [])], None, False
    current = sections[0]
    for line in lines:
        if line.lstrip().startswith(('```', '~~~')):
            fenced = not fenced
        match = None if fenced else HEADING.match(line)
        if match and len(match.group(1)) <= 2:
            current = (len(match.group(1)), match.group(2), [])
            sections.append(current)
        else:
            current[2].append(line)
    return sections


def anchors_of(lines):
    """The anchors of every heading of some lines (fenced code skipped)."""
    fenced, found = False, []
    for line in lines:
        if line.lstrip().startswith(('```', '~~~')):
            fenced = not fenced
        match = None if fenced else HEADING.match(line)
        if match:
            found.append(slug(match.group(2), '-'))
    return found


def demote(lines):
    """Headings one level up (## becomes #), outside fenced code."""
    fenced, out = False, []
    for line in lines:
        if line.lstrip().startswith(('```', '~~~')):
            fenced = not fenced
        match = None if fenced else HEADING.match(line)
        out.append(('#' * max(1, len(match.group(1)) - 1) + ' ' + match.group(2)) if match else line)
    return out


def tidy_lists(lines):
    """A blank line before a list, and four spaces to nest where the README uses two."""
    out, fenced = [], False
    for index, line in enumerate(lines):
        if line.lstrip().startswith(('```', '~~~')):
            fenced = not fenced
            out.append(line)
            continue
        if fenced:
            out.append(line)
            continue
        item = LIST_ITEM.match(line)
        if item and out:
            previous = out[-1]
            if previous.strip() and not LIST_ITEM.match(previous) and not previous.startswith((' ', '\t')) \
                    and not previous.lstrip().startswith(('<', '>', '|')):
                out.append('')
        out.append(line)
    # nesting: in a block of list lines whose smallest indent after the first is 2, double every indent
    result, block = [], []

    def flush():
        indents = [len(LIST_ITEM.match(row).group(1)) for row in block if LIST_ITEM.match(row)]
        nested = sorted({i for i in indents if i})
        double = bool(nested) and nested[0] == 2
        for row in block:
            item = LIST_ITEM.match(row)
            if double and item and item.group(1):
                row = ' ' * len(item.group(1)) + row
            result.append(row)
        block.clear()

    fenced = False
    for line in out:
        if line.lstrip().startswith(('```', '~~~')):
            flush()
            fenced = not fenced
            result.append(line)
        elif fenced:
            result.append(line)
        elif LIST_ITEM.match(line) or (block and line.startswith(' ') and line.strip()):
            block.append(line)
        else:
            flush()
            result.append(line)
    flush()
    return result


def main():
    lines = README.read_text(encoding='utf-8').splitlines()
    sections = read_sections(lines)

    # Group the sections: a menu section per `# ` heading, a page per `## ` heading
    groups = []  # [{'title', 'intro': [lines], 'pages': [{'title','lines'}]}]
    preface = sections[0][2]
    for level, title, body in sections[1:]:
        if level == 1:
            groups.append({'title': title, 'intro': body, 'pages': []})
        else:
            groups[-1]['pages'].append({'title': title, 'lines': body})
    for group in groups:  # join a very short page to the next
        pages, carry = [], None
        for page in group['pages']:
            if carry:
                page['lines'] = [f"### {carry['title']}", *carry['lines'], *page['lines']]
                carry = None
            real = [row for row in page['lines'] if row.strip()]
            if len(real) < TINY and page is not group['pages'][-1]:
                carry = page
                continue
            pages.append(page)
        group['pages'] = pages

    # Where is each anchor?
    location = {}
    for gi, group in enumerate(groups):
        folder = slug(group['title'], '-')
        for anchor in anchors_of(group['intro']):
            location.setdefault(anchor, f"{folder}/index.md")
        for page in group['pages']:
            name = f"{folder}/{slug(page['title'], '-')}.md"
            for anchor in anchors_of([f"## {page['title']}", *page['lines']]):
                location.setdefault(anchor, name)

    def relink(text, here):
        def repl(match):
            anchor = match.group(1)
            target = location.get(anchor)
            if not target:
                print(f"  warning: no page has the anchor #{anchor}", file=sys.stderr)
                return match.group(0)
            if target == here:
                return f"](#{anchor})"
            up = '../' * here.count('/')
            return f"]({up}{target}#{anchor})"
        return re.sub(r'\]\(#([^)\s]+)\)', repl, text)

    def write(path, title, body, here):
        text = '\n'.join(tidy_lists(demote(body)) if body else [])
        text = relink(text, here)
        target = OUT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"# {title}\n\n{text.strip()}\n", encoding='utf-8')

    if OUT.exists():
        shutil.rmtree(OUT)
    nav = []
    for group in groups:
        folder = slug(group['title'], '-')
        intro = [row for row in group['intro'] if row.strip()]
        entries = []
        if intro:
            write(f"{folder}/index.md", group['title'], group['intro'], f"{folder}/index.md")
            entries.append({'Introduction': f"guide/{folder}/index.md"})
        for page in group['pages']:
            name = f"{folder}/{slug(page['title'], '-')}.md"
            write(name, page['title'], page['lines'], name)
            entries.append({page['title']: f"guide/{name}"})
        nav.append((group['title'], entries))

    write_reference()

    # The README's first lines (who made it) go to the home page of the guide
    (OUT / 'preface.md').write_text('\n'.join(preface).strip() + '\n', encoding='utf-8')

    # The menu goes into mkdocs.yml, made from mkdocs.template.yml (the hand-written pages are in it already)
    lines_out = []
    for title, entries in nav:
        lines_out.append(f"  - {json.dumps(title)}:")
        for entry in entries:
            (name, path), = entry.items()
            lines_out.append(f"      - {json.dumps(name)}: {path}")
    template = (HERE / 'mkdocs.template.yml').read_text(encoding='utf-8')
    (HERE / 'mkdocs.yml').write_text(template.replace('{{GUIDE_NAV}}', '\n'.join(lines_out)), encoding='utf-8')
    print(f"{sum(len(g['pages']) for g in groups)} pages written in {OUT}")


if __name__ == '__main__':
    main()
