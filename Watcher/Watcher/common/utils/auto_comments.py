"""
The lines Watcher writes by itself in the comments of a domain or a website (where it comes from, what it did), dated, above
what a person wrote. A comment holds 300 characters: the text of a person is never cut to make room; when both do not fit,
the line is not written (the history of the object keeps the event, without a limit).
"""
from datetime import date

COMMENTS_MAX = 300


def line(note, today=None):
    """'[2026-11-23] Moved from Legitimate Domains: not registered.'"""
    return f"[{(today or date.today()).isoformat()}] {note}"


def combine(note, existing='', limit=COMMENTS_MAX):
    """The dated note above the existing comments; the existing comments alone when the two do not fit."""
    existing = (existing or '').strip()
    text = line(note)
    if not existing:
        return text[:limit]
    candidate = f"{text}\n{existing}"
    return candidate if len(candidate) <= limit else existing


def join(first, second, limit=COMMENTS_MAX):
    """Two texts one above the other; the first alone when the two do not fit."""
    first, second = (first or '').strip(), (second or '').strip()
    if not second:
        return first
    candidate = f"{first}\n{second}" if first else second
    return candidate if len(candidate) <= limit else first


def add_note(model, pk, note, limit=COMMENTS_MAX):
    """
    Write a dated note above the comments an object has *now* (read again from the database: a job holds an object read long
    before, and saving that one would erase what a person wrote meanwhile). A queryset update, so no timeline event of its own.
    Returns whether the note was written.
    """
    current = (model.objects.filter(pk=pk).values_list('comments', flat=True).first() or '').strip()
    new = combine(note, current, limit)
    if new == current:
        return False
    model.objects.filter(pk=pk).update(comments=new)
    return True
