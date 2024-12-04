from django.conf import settings


def get_threats_watcher_template(words_occurrence, email_words):
    github_repo = "https://github.com/thalesgroup-cert/Watcher"
    body = """\
    <html>
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
            <style>
                /* Reset Styles */
                body, p, table, td, div {
                    margin: 0;
                    padding: 0;
                    font-family: 'Lato', sans-serif; 
                    line-height: 1.6;
                }
                
                /* Base Styles */
                body {
                    background-color: #f5f7fa;
                    color: #2d3748;
                    font-size: 14px;
                }
                
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                
                /* Header Styles */
                .header {
                    background: linear-gradient(135deg, #00267F 0%, #1a365d 100%);
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
                
                /* Content Styles */
                .content {
                    padding: 40px 30px;
                }
                
                .content p {
                    margin-bottom: 20px;
                    color: #4a5568;
                }
                
                .word-list {
                    background: #f3f4f6;
                    border-left: 4px solid #00267F;
                    padding: 15px 20px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                
                .word-list p {
                    margin: 8px 0;
                    color: #2d3748;
                    font-size: 15px;
                }
                
                /* Footer Styles */
                .footer {
                    background: #58c3d7;
                    padding: 30px 20px;
                    text-align: center;
                }
                
                .footer-logo {
                    margin-bottom: 20px;
                }
                
                .footer-logo img {
                    width: 90px;
                    height: 90px;
                }
                
                .github-link {
                    display: inline-block;
                    padding: 8px 15px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 5px;
                    color: #ffffff;
                    text-decoration: none;
                    transition: background 0.3s ease;
                }
                
                .github-link:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                
                .github-link img {
                    width: 20px;
                    height: 20px;
                    vertical-align: middle;
                    margin-right: 8px;
                    filter: invert(1);
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
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <img src=\"""" + str(settings.WATCHER_LOGO_BASE64) + """\" alt="Threats Watcher Logo">
                    <h1>Threats Watcher</h1>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <p>Dear team,</p>
                    
                    <p>Please find below trendy word(s) that match at least <strong>""" + str(words_occurrence) + """</strong> times:</p>
                    
                    <div class="word-list">
                    """ + "<p>".join(email_words) + """
                    </div>

                    <p>You can check more details <a href="{settings.WATCHER_URL}#/">here.</a></p>
                    
                    <p>Kind Regards,<br>
                    <strong>Watcher</strong></p>
                </div>
                
                <!-- Footer -->
                <div class="footer">

                    <a href=\"""" + github_repo + """\" class="github-link">
                        <img src="https://cdnjs.cloudflare.com/ajax/libs/simple-icons/3.0.1/github.svg" alt="GitHub">
                        View Watcher on GitHub
                    </a>
                </div>
            </div>
            
            <p class="classification">[""" + str(settings.EMAIL_CLASSIFICATION) + """]</p>
        </body>
    </html>
    """
    return body