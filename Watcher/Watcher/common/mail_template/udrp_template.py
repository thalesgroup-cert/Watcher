from django.conf import settings


def get_udrp_template(site, decision, label, today):
    """
    Generate the HTML email body for a UDRP decision notification.

    :param site: The Site instance concerned by the decision.
    :param decision: 'won' or 'lost'.
    :param label: Human-readable label for the decision.
    :param today: ISO date string of the decision date.
    :return: HTML email body as a string.
    """
    domain_sanitized = site.domain_name.replace('.', '[.]')
    ticket = site.ticket_id or 'N/A'
    decision_color = '#38a169' if decision == 'won' else '#e53e3e'
    decision_icon = '✅' if decision == 'won' else '❌'

    transfer_note = ''
    if decision == 'won':
        transfer_note = (
            '<p style="color:#38a169;font-weight:bold;">'
            'This domain has been automatically added to the Legitimate Domains list.'
            '</p>'
        )

    body = """\
    <html>
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
            <style>
                body, p, table, td, div {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, Helvetica, sans-serif;
                    line-height: 1.6;
                }
                body {
                    background-color: #f5f7fa;
                    color: #2d3748;
                    font-size: 14px;
                }
                .container {
                    width: 100%;
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    border-radius: 30px;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                .header {
                    background: #00267F;
                    padding: 30px 20px;
                    text-align: center;
                }
                .header h1 {
                    color: #ffffff;
                    font-size: 28px;
                    font-weight: 600;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .header img {
                    width: 80px;
                    height: auto;
                    margin-bottom: 15px;
                }
                .content {
                    padding: 40px 30px;
                }
                .content p {
                    margin-bottom: 20px;
                    color: #4a5568;
                }
                .details {
                    background: #f3f4f6;
                    border-left: 4px solid #00267F;
                    padding: 15px 10px 15px 10px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                .details p {
                    margin: 8px 0;
                    color: #2d3748;
                    font-size: 15px;
                }
                .details p:last-child {
                    margin-bottom: 0;
                }
                .footer {
                    background: #58c3d7;
                    padding: 30px 20px;
                    text-align: center;
                    border-bottom-left-radius: 8px;
                    border-bottom-right-radius: 8px;
                }
                .footer a {
                    color: #ffffff;
                    text-decoration: none;
                    font-size: 14px;
                    display: inline-block;
                    padding: 8px 15px;
                    margin-top: 10px;
                }
                .classification {
                    text-align: center;
                    font-size: 12px;
                    color: #718096;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <table class="container" align="center">
                <tr>
                    <td class="header" colspan="2">
                        <img src=\"""" + str(settings.WATCHER_LOGO) + """" alt="Watcher Logo">
                        <h1>UDRP Decision</h1>
                    </td>
                </tr>
                <tr>
                    <td class="content" colspan="2">
                        <p>Dear team,</p>
                        <p>
                            A UDRP decision has been automatically detected for a domain
                            monitored in the <strong>Site Monitoring</strong> module.
                        </p>
                        <div class="details">
                            <p>
                                <strong>Domain:</strong>
                                <span style="font-family:monospace;">""" + domain_sanitized + """</span>
                            </p>
                            <p>
                                <strong>Decision:</strong>
                                <span style="color:""" + decision_color + """;font-weight:bold;">
                                    """ + decision_icon + ' ' + label + """
                                </span>
                            </p>
                            <p><strong>Date:</strong> """ + today + """</p>
                            <p><strong>Ticket:</strong> """ + ticket + """</p>
                            <p><strong>Source:</strong> udrpsearch.com</p>
                        </div>
                        """ + transfer_note + """
                        <p>
                            You can check more details
                            <a href=\"""" + str(settings.WATCHER_URL) + """#/website_monitoring">here</a>.
                        </p>
                        <p>Kind Regards,<br><br><strong>Watcher</strong></p>
                    </td>
                </tr>
                <tr>
                    <td class="footer" colspan="2">
                        <a href="https://github.com/thalesgroup-cert/Watcher">
                            <img src=\"""" + str(settings.GITHUB_LOGO) + """" alt="GitHub">
                        </a>
                    </td>
                </tr>
            </table>
            <p class="classification">[""" + str(settings.EMAIL_CLASSIFICATION) + """]</p>
        </body>
    </html>
    """
    return body
