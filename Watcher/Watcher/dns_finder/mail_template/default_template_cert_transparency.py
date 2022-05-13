from django.conf import settings


def get_cert_transparency_template(alert):
    body = """\
        <html>
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
                <style>
                    /* Client-specific Styles */
                    #outlook a{padding:0;} /* Force Outlook to provide a "view in browser" button. */
                    body{width:100% !important;} .ReadMsgBody{width:100%;} .ExternalClass{width:100%;} /* Force Hotmail to display emails at full width */
                    body{-webkit-text-size-adjust:none;} /* Prevent Webkit platforms from changing default text sizes. */
        
                    /* Reset Styles */
                    body{margin:0; padding:0;}
                    img{border:0; height:auto; line-height:100%; outline:none; text-decoration:none;}
                    table td{border-collapse:collapse;}
                    #backgroundTable{height:100% !important; margin:0; padding:0; width:100% !important;}
        
                    /* Template Styles */
                    body, #bgTable{
                        background-color:#ebeff3;
                        font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;font-style: normal;font-weight: 400;font-size:14px;color:#666666;line-height:20px;
                        margin-top: 40px;
                    }
        
                    /**
                    * @tab Page
                    * @section heading 1
                    * @tip Set the styling for all first-level headings in your emails. These should be the largest of your headings.
                    * @style heading 1
                    */
                    h1, .h1{
                        /*@editable*/ color:#ffffff;
                        display:block;
                        /*@editable*/ font-family: Century Gothic,CenturyGothic,AppleGothic,sans-serif; 
                        /*@editable*/ font-size:26px;
                        /*@editable*/ font-weight:lighter;
                        /*@editable*/ line-height:100%;
                    }                    
                    h2, .h2{
                        /*@editable*/ color:#ffffff;
                        display:block;
                        /*@editable*/ font-family: Century Gothic,CenturyGothic,AppleGothic,sans-serif; 
                        /*@editable*/ font-size:26px;
                        /*@editable*/ font-weight:lighter;
                        /*@editable*/ line-height:100%;
                    }
                    h3, .h3{
                        /*@editable*/ color:#ffffff;
                        display:block;
                        /*@editable*/ font-family: Century Gothic,CenturyGothic,AppleGothic,sans-serif; 
                        /*@editable*/ font-size:26px;
                        /*@editable*/ font-weight:lighter;
                        /*@editable*/ line-height:100%;
                    }
                    h4, .h4{
                        /*@editable*/ color:#ffffff;
                        display:block;
                        /*@editable*/ font-family: Century Gothic,CenturyGothic,AppleGothic,sans-serif; 
                        /*@editable*/ font-size:26px;
                        /*@editable*/ font-weight:lighter;
                        /*@editable*/ line-height:100%;
                    }
        
                    h1.txtCenter, h2.txtCenter, h3.txtCenter, h4.txtCenter {
                        text-align:inherit;
                    }     
                    /**
                    * @tab Body
                    * @section body style
                    * @tip Set the background color for your email's body area.
                    */
                    #templateContainer, .bodyContent{
                        /*@editable*/ background-color:#FFFFFF;
                    }
                    /**
                    * @tab Body
                    * @section body link
                    * @tip Set the styling for your email's main content links. Choose a color that helps them stand out from your text.
                    */
                    .bodyContent a:link, .bodyContent a:visited, /* Yahoo! Mail Override */ .bodyContent a .yshortcuts /* Yahoo! Mail Override */{
                        /*@editable*/ color:#242A75;
                        /*@editable*/ font-weight:normal;
                        /*@editable*/ text-decoration:underline;
                    }
                    .bodyContent img{
                        display:inline;
                        height:auto;
                    }
                    .thales-header {
                        background-color:#00267F;
                    }
                    .thales-footer {
                        background-color:#58c3d7;
                        color:#ffffff;
                        font-size:12px;
                    }
                    .bodyContent1 {	
                        background-color:#FFFFFF;
                    }
            </style> <base href="">
          </head>
          <body bgcolor="#FFFFFF" text="#000000">
            <table class="thales-header" style="width: 600px;" align="center" cellpadding="0" cellspacing="0">
                <tbody>
                <tr>
                    <td colspan="2" align="center" height="100">       
                        <h1>DNS Finder: Alert 
                        """
    body += "#" + str(
        alert.pk) + """
                        </h1>
                     </td>
                </tr>
                </tbody>
            </table>
                    <table class="bodyContent" style="width: 600px;" align="center" cellpadding="0" cellspacing="0">
                      <tbody>
                        <tr>
                          <td align="center" bgcolor="#ffffff">
                            <table style="width: 480px;" align="center" cellpadding="0" cellspacing="0">
                              <!-- Espace -->
                              <tbody>
                                <tr>
                                  <td align="left" bgcolor="#ffffff" height="40"><br>
                                  </td>
                                </tr>
                                <!-- Contenu -->
                                <tr>
                                  <td style="text-align: center;" align="left" bgcolor="#ffffff">
                                    <p style="text-align: left;">Dear team,</p>
                                    <p style="text-align: justify;">New Twisted DNS found: 
                                    <b>
        """
    body += str(
        alert.dns_twisted.domain_name) + """</b></p> <p style="text-align: left; margin-left: 30px;"> Asset: 
        """
    body += str(
        alert.dns_twisted.keyword_monitored) + """ </p> <p style="text-align: left; margin-left: 30px; margin-bottom: 25px;"> Details <a href="
        """
    body += str(
        settings.WATCHER_URL + "/#/dns_finder") + """ ">here</a>.</p>
                                    <p style="text-align: justify;">
                                        Best Regards,
                                    </p>
                                    <p style="text-align: justify;"><strong>Watcher</strong><br>
                                      <em style="text-align: justify;"></em><br>
                                      <strong></strong><em></em></p>
                                  </td>
                                </tr>
                                <tr>
                                  <td align="left" bgcolor="#ffffff" height="20"><br>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <!-- Pied de mail -->
                    <table class="thales-footer" style="width: 600px;" align="center" cellpadding="0" cellspacing="0">
                      <tbody>
                        <tr>
                          <td align="center">
                            <table style="width: 520px;" align="center" cellpadding="0" cellspacing="0">
                              <tbody>
                                <tr>
                                  <td colspan="2" align="center" height="100"> 
                                      <td align="center"><img src="
                                      """
    body += str(
        settings.WATCHER_LOGO) + """ " height="90" width="90"></td>                    
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <p style="text-align: center;"><span style="font-size: 8pt;"><em><strong>["""
    body += str(
        settings.EMAIL_CLASSIFICATION) + """]</strong></em></span></p><br>
          </body>
        </html>
        """
    return body
