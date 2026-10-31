from .base import link_to, render_email


def get_threats_watcher_template(words_occurrence, email_words, link_url=None):
    # The words come with their own markup (a count, a link): they are shown as they are
    return render_email(
        title="Trendy Threats Detected",
        intro="These words are trending in the monitored sources.",
        blocks='<div class="block">' + '<br>'.join(email_words) + '</div>',
        link=link_url or link_to(''),
    )
