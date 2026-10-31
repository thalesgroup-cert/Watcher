from .base import link_to, render_email


def get_data_leak_group_template(keyword, alerts_number, link_url=None):
    return render_email(
        title="Data Leak",
        intro=f"{alerts_number} new data leakage alerts were detected for the keyword {keyword}.",
        rows=[('Keyword', keyword), ('New alerts', alerts_number)],
        link=link_url or link_to('data_leak'),
    )
