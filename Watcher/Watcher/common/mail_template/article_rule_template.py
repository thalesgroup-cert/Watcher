from .base import render_email


def get_article_rule_template(ctx):
    """
    Email of an article that matched a monitored keyword written as a rule.

    :param ctx: rule_name, article_title, article_url, matched_words, details_url.
    """
    return render_email(
        title="Keyword rule match",
        intro="An article of the RSS feeds matched one of the monitored keyword rules.",
        rows=[('Rule', ctx.get('rule_name')), ('Article', ctx.get('article_title')), ('URL', ctx.get('article_url')),
              ('Words found', ctx.get('matched_words'))],
        link=ctx.get('details_url'),
    )
