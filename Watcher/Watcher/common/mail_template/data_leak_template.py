from .base import link_to, render_email


def get_data_leak_template(alert, link_url=None):
    return render_email(
        title="Data Leak",
        intro="A page matching a monitored keyword was found.",
        rows=[('Keyword', alert.keyword), ('Source', alert.url)],
        link=link_url or link_to('data_leak'),
    )
