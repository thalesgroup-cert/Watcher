"""
Messages written by hand: plain text with `{variable}` placeholders and `{{#if variable}}...{{else}}...{{/if}}` blocks
that only show when the variable holds a value.
"""
import re

MAX_LENGTH = 6000

_BLOCK = re.compile(r'(\{\{#if\s+[^{}]*?\}\}|\{\{else\}\}|\{\{/if\}\})')
_IF = re.compile(r'\{\{#if\s+([A-Za-z_][\w.]*)\s*\}\}$')
_VARIABLE = re.compile(r'\{([A-Za-z_][\w.]*)\}')


def _parse(text):
    """Tree of the template: strings, and ('if', name, then, otherwise) blocks. ValueError when the blocks do not match."""
    root = []
    stack = [(None, root, None)]  # (name, branch being filled, then-branch once `else` was met)
    for part in _BLOCK.split(text):
        if not part:
            continue
        if part.startswith('{{#if'):
            match = _IF.match(part)
            if not match:
                raise ValueError(f"Invalid condition: {part}")
            stack.append((match.group(1), [], None))
        elif part == '{{else}}':
            name, branch, then = stack[-1]
            if name is None or then is not None:
                raise ValueError("'{{else}}' without a matching '{{#if ...}}'")
            stack[-1] = (name, [], branch)
        elif part == '{{/if}}':
            if len(stack) == 1:
                raise ValueError("'{{/if}}' without a matching '{{#if ...}}'")
            name, branch, then = stack.pop()
            node = ('if', name, branch, []) if then is None else ('if', name, then, branch)
            stack[-1][1].append(node)
        else:
            stack[-1][1].append(part)
    if len(stack) > 1:
        raise ValueError("'{{#if ...}}' without a matching '{{/if}}'")
    return root


def names_used(text):
    """Every variable the template reads, in conditions and in placeholders."""
    _parse(text)
    return set(_VARIABLE.findall(text)) | set(re.findall(r'\{\{#if\s+([A-Za-z_][\w.]*)\s*\}\}', text))


def validate(text, allowed):
    """ValueError when the template is too long, badly built or reads a variable the notification does not have."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("The message cannot be empty")
    if len(text) > MAX_LENGTH:
        raise ValueError(f"The message is limited to {MAX_LENGTH} characters")
    unknown = sorted(names_used(text) - set(allowed))
    if unknown:
        raise ValueError(f"Unknown variable(s): {', '.join(unknown)}")


def resolve(ctx, name):
    """Value of `a.b.c` in the context (keys, then attributes); None when something on the way is missing."""
    current = ctx
    for part in name.split('.'):
        if current is None:
            return None
        current = current.get(part) if isinstance(current, dict) else getattr(current, part, None)
    return current


def has_value(value):
    return not (value is None or value == '' or value == [] or value == {} or (isinstance(value, str) and not value.strip()))


def _render(nodes, ctx):
    out = []
    for node in nodes:
        if isinstance(node, str):
            # Values are inserted as they are: braces they contain are not read again.
            out.append(_VARIABLE.sub(lambda m: _text(resolve(ctx, m.group(1))), node))
        else:
            _, name, then, otherwise = node
            out.append(_render(then if has_value(resolve(ctx, name)) else otherwise, ctx))
    return ''.join(out)


def _text(value):
    return '' if value is None else str(value)


def render(text, ctx):
    return _render(_parse(text), ctx)
