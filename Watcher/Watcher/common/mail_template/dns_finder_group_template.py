from django.conf import settings

def get_dns_finder_group_template(dns_monitored, alerts_number):
    body = f"""\
    <html>
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
            <style>
                /* Reset Styles */
                body, table, td, p {{
                    margin: 0;
                    padding: 0;
                    font-family: 'Lato', sans-serif;
                    color: #333333;
                    line-height: 1.6;
                }}
                
                body {{
                    background-color: #f9fafc;
                    font-size: 14px;
                }}
                
                .container {{
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }}
                
                /* Header */
                .header {{
                    background: linear-gradient(135deg, #00267F 0%, #1a365d 100%);
                    color: #ffffff;
                    padding: 20px;
                    text-align: center;
                    border-top-left-radius: 8px;
                    border-top-right-radius: 8px;
                }}
                
                .header h1 {{
                    font-size: 24px;
                    margin: 0;
                }}
                
                .header img {{
                    width: 80px; /* Taille réduite du logo */
                    height: auto;
                    margin-bottom: 10px;
                }}
                
                /* Content */
                .content {{
                    padding: 20px 30px;
                }}
                
                .content p {{
                    margin-bottom: 16px;
                }}
                
                .details {{
                    background: #f3f4f6;
                    padding: 15px;
                    margin: 20px 0;
                    border-left: 4px solid #00267F;
                    border-radius: 4px;
                }}
                
                .details p {{
                    margin: 5px 0;
                }}
                
                .details strong {{
                    color: #333333;
                }}
                
                /* Footer */
                .footer {{
                    background: #58c3d7;
                    text-align: center;
                    padding: 20px;
                    color: #ffffff;
                    border-bottom-left-radius: 8px;
                    border-bottom-right-radius: 8px;
                }}
                
                .footer img {{
                    margin: 10px auto;
                    width: 80px;
                }}
                
                .github-link {{
                    display: inline-block;
                    padding: 8px 15px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 5px;
                    color: #ffffff;
                    text-decoration: none;
                    transition: background 0.3s ease;
                    margin-top: 10px;
                }}
                
                .github-link:hover {{
                    background: rgba(255, 255, 255, 0.2);
                }}
                
                .github-link img {{
                    width: 20px;
                    height: 20px;
                    vertical-align: middle;
                    margin-right: 8px;
                    filter: invert(1);
                }}
                
                .classification {{
                    text-align: center;
                    font-size: 12px;
                    color: #888888;
                    margin-top: 15px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <img src="{settings.WATCHER_LOGO_BASE64}" alt="Watcher Logo">
                    <h1>Group DNS Finder: Alerts</h1>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <p>Dear team,</p>
                    <p><strong>{alerts_number}</strong> New DNS Twisted Alerts for <strong>{dns_monitored.domain_name}</strong> asset:</p>
                    <p>You can check more details <a href="{settings.WATCHER_URL}#/dns_finder">here.</a></p>
                    
                    <p>Kind Regards,</p>
                    <p><strong>Watcher</strong></p>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <a href="https://github.com/thalesgroup-cert/Watcher" class="github-link">
                        <img src="https://cdnjs.cloudflare.com/ajax/libs/simple-icons/3.0.1/github.svg" alt="GitHub">
                        View Watcher on GitHub
                    </a>
                </div>
            </div>
            
            <p class="classification">[{settings.EMAIL_CLASSIFICATION}]</p>
        </body>
    </html>
    """
    return body