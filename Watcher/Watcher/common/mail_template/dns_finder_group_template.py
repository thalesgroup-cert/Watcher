from django.conf import settings

def get_dns_finder_group_template(dns_monitored, alerts_number):
    body = f"""\
    <html>
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
            <style>
                /* Reset Styles */
                body, p, table, td, div {{
                    margin: 0;
                    padding: 0;
                    font-family: Arial, Helvetica, sans-serif;
                    line-height: 1.6;
                }}
                
                /* Base Styles */
                body {{
                    background-color: #f5f7fa;
                    color: #2d3748;
                    font-size: 14px;
                }}

                .container {{
                    width: 100%;
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    border-radius: 30px;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }}
                
                /* Header Styles */
                .header {{
                    background: #00267F;
                    padding: 30px 20px;
                    text-align: center;
                    border-top-left-radius: 8px;
                    border-top-right-radius: 8px;
                }}
                
                .header h1 {{
                    color: #ffffff;
                    font-size: 28px;
                    font-weight: 600;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }}
                
                .header img {{
                    width: 80px;
                    height: auto;
                    margin-bottom: 15px;
                }}
                
                /* Content Styles */
                .content {{
                    padding: 40px 30px;
                }}
                
                .content p {{
                    margin-bottom: 20px;
                    color: #4a5568;
                }}
                
                .content a {{
                    color: #2b6cb0;
                    text-decoration: none;
                }}
                
                .content a:hover {{
                    text-decoration: underline;
                }}
                
                .details {{
                    background: #f3f4f6;
                    border-left: 10px solid #00267F;
                    padding: 15px 10px 15px 10px; 
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }}

                .details p {{
                    margin: 8px 0;
                    color: #2d3748;
                    font-size: 15px;
                }}

                .details p:last-child {{
                    margin-bottom: 0;
                }}

                /* Footer Styles */
                .footer {{
                    background: #58c3d7;
                    padding: 30px 20px;
                    text-align: center;
                    border-bottom-left-radius: 8px;
                    border-bottom-right-radius: 8px;
                }}

                .footer a {{
                    color: #ffffff;
                    text-decoration: none;
                    font-size: 14px;
                    display: inline-block;
                    padding: 8px 15px;
                    margin-top: 10px;
                }}
                
                .classification {{
                    text-align: center;
                    font-size: 12px;
                    color: #718096;
                    margin-top: 20px;
                }}
            </style>
        </head>
        <body>
            <table class="container" align="center">
                <tr>
                    <!-- Header -->
                    <td class="header" colspan="2">
                        <img src="{settings.WATCHER_LOGO_BASE64}" alt="DNS Finder Logo">
                        <h1>DNS Finder Group Alerts</h1>
                    </td>
                </tr>
                <!-- Content -->
                <tr>
                    <td class="content" colspan="2">
                        <p>Dear team,</p>
                        <p><strong>{alerts_number}</strong> New DNS Twisted Alerts for <strong>{dns_monitored.domain_name}</strong> asset.</p>
                        <p>You can check more details <a href="{settings.WATCHER_URL}#/dns_finder">here.</a></p>
                        
                        <p>Kind Regards,<br>
                        <br><strong>Watcher</strong></p>
                    </td>
                </tr>
                <!-- Footer -->
                <tr>
                    <td class="footer" colspan="2">
                        <a href="https://github.com/thalesgroup-cert/Watcher" class="github-link">
                            <img src="{settings.GITHUB_LOGO}" alt="GitHub">
                        </a>
                    </td>
                </tr>
            </table>
            <p class="classification">[{settings.EMAIL_CLASSIFICATION}]</p>
        </body>
    </html>
    """
    return body